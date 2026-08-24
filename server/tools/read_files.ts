import mime from "mime-types";
import {
  logToolCall,
  octokit,
  ownerRepoParams,
  validateOwnerRepo,
} from "../lib/github.js";

export const READ_FILES_MAX_PATHS = 20;
export const READ_FILES_MAX_DECODED_BYTES = 256 * 1024;

type GetContent = typeof octokit.repos.getContent;

export const readFilesSchema = {
  name: "read_files",
  category: "file",
  description:
    "Read up to 20 files in input order with SHAs and inline per-file errors. A 256 KiB decoded-content cap protects the caller's context (~70k tokens); oversized files return metadata without content.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      paths: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: READ_FILES_MAX_PATHS,
        description: "File paths, processed in input order",
      },
      branch: { type: "string", description: "Branch", default: "main" },
      content_encoding: {
        type: "string",
        enum: ["utf-8", "base64"],
        description: "Content encoding; size budget uses decoded bytes",
        default: "utf-8",
      },
      metadata_only: {
        type: "boolean",
        description: "Return only path, SHA, and byte size; content budget is not used",
        default: false,
      },
    },
    required: ["owner", "repo", "paths"],
  },
};

interface ReadFilesArgs {
  owner?: string;
  repo?: string;
  paths?: unknown;
  branch?: string;
  content_encoding?: string;
  metadata_only?: boolean;
}

function topLevelError(message: string) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export async function readFiles(
  args: ReadFilesArgs,
  getContent: GetContent = octokit.repos.getContent.bind(octokit.repos),
) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) return topLevelError(validated.error);
  const { owner, repo } = validated;
  const {
    branch = "main",
    content_encoding = "utf-8",
    metadata_only = false,
  } = args;

  if (!Array.isArray(args.paths) || args.paths.length === 0) {
    return topLevelError("paths must contain between 1 and 20 file paths.");
  }
  if (
    args.paths.length > READ_FILES_MAX_PATHS ||
    args.paths.some((filePath) => typeof filePath !== "string" || !filePath)
  ) {
    return topLevelError("paths must contain between 1 and 20 non-empty strings.");
  }
  if (content_encoding !== "utf-8" && content_encoding !== "base64") {
    return topLevelError(
      `Invalid content_encoding '${content_encoding}'. Must be 'utf-8' or 'base64'.`,
    );
  }
  if (typeof metadata_only !== "boolean") {
    return topLevelError("metadata_only must be a boolean.");
  }

  const files: Array<Record<string, unknown>> = [];
  let decodedBytes = 0;

  for (const filePath of args.paths as string[]) {
    try {
      const response = await getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      });
      const data = response.data;

      if (Array.isArray(data)) {
        files.push({ path: filePath, error: "directory" });
        continue;
      }
      if (
        data.type !== "file" ||
        typeof data.sha !== "string" ||
        typeof data.size !== "number"
      ) {
        files.push({ path: filePath, error: "not_file" });
        continue;
      }

      const sizeBytes = data.size;
      if (metadata_only) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
        });
        continue;
      }
      if (decodedBytes + sizeBytes > READ_FILES_MAX_DECODED_BYTES) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
          error: "aggregate_limit",
        });
        continue;
      }
      if (
        !("content" in data) ||
        typeof data.content !== "string" ||
        data.encoding !== "base64"
      ) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
          error: "content_unavailable",
        });
        continue;
      }

      const rawBase64 = data.content.replace(/\n/g, "");
      const decoded = Buffer.from(rawBase64, "base64");
      const decodedSize = Math.max(sizeBytes, decoded.byteLength);
      if (decodedBytes + decodedSize > READ_FILES_MAX_DECODED_BYTES) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: decodedSize,
          error: "aggregate_limit",
        });
        continue;
      }
      decodedBytes += decodedSize;

      if (content_encoding === "base64") {
        files.push({
          path: filePath,
          sha: data.sha,
          content: rawBase64,
          content_encoding: "base64",
          mime_type: mime.lookup(filePath) || "application/octet-stream",
          size_bytes: decodedSize,
        });
      } else {
        files.push({
          path: filePath,
          sha: data.sha,
          content: decoded.toString("utf-8"),
        });
      }
    } catch (error: any) {
      files.push({
        path: filePath,
        error: error?.status === 404 ? "not_found" : "github_api",
      });
    }
  }

  const inlineErrors = files.filter((file) => "error" in file).length;
  logToolCall(
    "read_files",
    {
      owner,
      repo,
      paths: args.paths,
      branch,
      content_encoding,
      metadata_only,
    },
    "success",
    `${files.length} paths, ${inlineErrors} inline errors, ${decodedBytes} decoded bytes`,
  );
  return {
    content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
  };
}
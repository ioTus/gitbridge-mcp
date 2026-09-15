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
type GetBlob = typeof octokit.git.getBlob;

export const readFilesSchema = {
  name: "read_files",
  category: "file",
  description:
    "Read up to 20 files in input order with SHAs and inline per-file errors. A 256 KiB decoded-content cap protects the caller's context (~70k tokens); oversized files can be read in single-file byte ranges with offset_bytes and max_bytes.",
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
      offset_bytes: {
        type: "integer",
        minimum: 0,
        default: 0,
        description:
          "Start byte offset for a single-file range. Explicitly providing this or max_bytes enables range mode; UTF-8 offsets snap down to a character boundary.",
      },
      max_bytes: {
        type: "integer",
        minimum: 1,
        description:
          "Maximum decoded bytes for a single-file range. Range responses are capped at 256 KiB.",
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
  offset_bytes?: unknown;
  max_bytes?: unknown;
}

function topLevelError(message: string) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isUtf8ContinuationByte(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function snapUtf8Start(bytes: Buffer, offset: number): number {
  let actualOffset = Math.min(offset, bytes.byteLength);
  while (
    actualOffset > 0 &&
    actualOffset < bytes.byteLength &&
    isUtf8ContinuationByte(bytes[actualOffset])
  ) {
    actualOffset -= 1;
  }
  return actualOffset;
}

function snapUtf8End(bytes: Buffer, start: number, end: number): number {
  let actualEnd = Math.min(end, bytes.byteLength);
  while (
    actualEnd > start &&
    actualEnd < bytes.byteLength &&
    isUtf8ContinuationByte(bytes[actualEnd])
  ) {
    actualEnd -= 1;
  }
  return actualEnd;
}

function utf8CharacterByteLength(bytes: Buffer, offset: number): number {
  const first = bytes[offset];
  if (first === undefined || first < 0x80) return 1;
  if (first >= 0xc2 && first <= 0xdf) return 2;
  if (first >= 0xe0 && first <= 0xef) return 3;
  if (first >= 0xf0 && first <= 0xf4) return 4;
  return 1;
}

function fileTooLargeMessage(): string {
  return `File exceeds the ${READ_FILES_MAX_DECODED_BYTES}-byte decoded-content limit; use offset_bytes and max_bytes to read it in ranges.`;
}

function apiErrorName(error: any): "not_found" | "github_api" {
  return error?.status === 404 ? "not_found" : "github_api";
}

export async function readFiles(
  args: ReadFilesArgs,
  getContent: GetContent = octokit.repos.getContent.bind(octokit.repos),
  getBlob: GetBlob = octokit.git.getBlob.bind(octokit.git),
) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) return topLevelError(validated.error);
  const { owner, repo } = validated;
  const {
    branch = "main",
    content_encoding = "utf-8",
    metadata_only = false,
  } = args;
  const hasOffset = Object.prototype.hasOwnProperty.call(args, "offset_bytes");
  const hasMax = Object.prototype.hasOwnProperty.call(args, "max_bytes");
  const rangeRequested = hasOffset || hasMax;
  const offsetBytes = hasOffset ? args.offset_bytes : 0;
  const maxBytes = hasMax ? args.max_bytes : undefined;

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
  if (hasOffset && !isNonNegativeSafeInteger(offsetBytes)) {
    return topLevelError("offset_bytes must be a nonnegative safe integer.");
  }
  if (hasMax && !isPositiveSafeInteger(maxBytes)) {
    return topLevelError("max_bytes must be a positive safe integer.");
  }
  if (rangeRequested && args.paths.length > 1) {
    return topLevelError(
      "offset_bytes and max_bytes are supported only when reading exactly one file.",
    );
  }
  if (rangeRequested && metadata_only) {
    return topLevelError(
      "offset_bytes and max_bytes cannot be used with metadata_only.",
    );
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

      if (rangeRequested) {
        if ((offsetBytes as number) > sizeBytes) {
          files.push({
            path: filePath,
            sha: data.sha,
            size_bytes: sizeBytes,
            error: "offset_out_of_range",
            message: `offset_bytes ${offsetBytes} is beyond this file's ${sizeBytes}-byte size; use an offset_bytes from 0 through ${sizeBytes}.`,
          });
          continue;
        }

        let blobResponse;
        try {
          blobResponse = await getBlob({
            owner,
            repo,
            file_sha: data.sha,
          });
        } catch (error: any) {
          files.push({
            path: filePath,
            sha: data.sha,
            size_bytes: sizeBytes,
            error: apiErrorName(error),
          });
          continue;
        }

        const blobData = blobResponse.data;
        if (
          !blobData ||
          typeof blobData.content !== "string" ||
          blobData.encoding !== "base64"
        ) {
          files.push({
            path: filePath,
            sha: data.sha,
            size_bytes: sizeBytes,
            error: "content_unavailable",
          });
          continue;
        }

        const decoded = Buffer.from(
          blobData.content.replace(/\s/g, ""),
          "base64",
        );
        const requestedOffset = offsetBytes as number;
        const sourceOffset =
          content_encoding === "utf-8"
            ? snapUtf8Start(decoded, requestedOffset)
            : Math.min(requestedOffset, decoded.byteLength);
        const rangeLimit = Math.min(
          maxBytes === undefined
            ? READ_FILES_MAX_DECODED_BYTES
            : (maxBytes as number),
          READ_FILES_MAX_DECODED_BYTES,
        );
        const requestedEnd = Math.min(
          sourceOffset + rangeLimit,
          decoded.byteLength,
        );
        const sourceEnd =
          content_encoding === "utf-8"
            ? snapUtf8End(decoded, sourceOffset, requestedEnd)
            : requestedEnd;

        if (
          content_encoding === "utf-8" &&
          sourceOffset < decoded.byteLength &&
          sourceEnd === sourceOffset &&
          maxBytes !== undefined
        ) {
          const characterBytes = utf8CharacterByteLength(decoded, sourceOffset);
          files.push({
            path: filePath,
            sha: data.sha,
            size_bytes: sizeBytes,
            offset_bytes: sourceOffset,
            returned_bytes: 0,
            error: "max_bytes_too_small",
            message: `max_bytes (${maxBytes}) is too small to return the next UTF-8 character (${characterBytes} bytes); increase max_bytes to at least ${characterBytes}.`,
          });
          continue;
        }

        const sliced = decoded.subarray(sourceOffset, sourceEnd);
        const rangedFile: Record<string, unknown> = {
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
          offset_bytes: sourceOffset,
          returned_bytes: sliced.byteLength,
          has_more: sourceEnd < decoded.byteLength,
        };
        if (content_encoding === "base64") {
          rangedFile.content = sliced.toString("base64");
          rangedFile.content_encoding = "base64";
          rangedFile.mime_type =
            mime.lookup(filePath) || "application/octet-stream";
        } else {
          rangedFile.content = sliced.toString("utf-8");
        }
        files.push(rangedFile);
        continue;
      }

      if (
        sizeBytes > READ_FILES_MAX_DECODED_BYTES &&
        decodedBytes === 0
      ) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
          error: "file_too_large",
          message: fileTooLargeMessage(),
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
      if (decodedSize > READ_FILES_MAX_DECODED_BYTES && decodedBytes === 0) {
        files.push({
          path: filePath,
          sha: data.sha,
          size_bytes: sizeBytes,
          error: "file_too_large",
          message: fileTooLargeMessage(),
        });
        continue;
      }
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
      offset_bytes: hasOffset ? offsetBytes : undefined,
      max_bytes: hasMax ? maxBytes : undefined,
    },
    "success",
    `${files.length} paths, ${inlineErrors} inline errors, ${decodedBytes} decoded bytes`,
  );
  return {
    content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
  };
}
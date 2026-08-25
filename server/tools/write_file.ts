import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const writeFileSchema = {
  name: "write_file",
  category: "file",
  description: "Create or replace one file in one commit. Supports UTF-8 or base64 content.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Complete content; base64 when selected" },
      commit_message: { type: "string", description: "Commit message; generated if omitted" },
      branch: { type: "string", description: "Branch", default: "main" },
      content_encoding: {
        type: "string",
        enum: ["utf-8", "base64"],
        description: "Content encoding; base64 is pre-encoded binary",
        default: "utf-8",
      },
    },
    required: ["owner", "repo", "path", "content"],
  },
};

export async function writeFile(args: {
  owner?: string;
  repo?: string;
  path: string;
  content: string;
  commit_message?: string;
  branch?: string;
  content_encoding?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { path, content, branch = "main", content_encoding = "utf-8" } = args;

  if (content_encoding !== "utf-8" && content_encoding !== "base64") {
    return { content: [{ type: "text", text: `Error: Invalid content_encoding '${content_encoding}'. Must be 'utf-8' or 'base64'.` }], isError: true };
  }

  const commitMessage = args.commit_message || `Claude: update ${path}`;

  try {
    let sha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path, ref: branch });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch {
    }

    const encodedContent = content_encoding === "base64"
      ? content
      : Buffer.from(content).toString("base64");

    const response = await octokit.repos.createOrUpdateFileContents({
      owner, repo, path,
      message: commitMessage,
      content: encodedContent,
      branch,
      ...(sha ? { sha } : {}),
    });

    const commitSha = response.data.commit.sha;
    logToolCall("write_file", { owner, repo, path, branch, content_encoding, commit_message: commitMessage }, "success", `commit: ${commitSha}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ path, commit_sha: commitSha }),
        },
      ],
    };
  } catch (error: any) {
    const message = `Failed to write file: ${error.message}`;
    logToolCall("write_file", { owner, repo, path, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

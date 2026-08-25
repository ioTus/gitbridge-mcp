import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const moveFileSchema = {
  name: "move_file",
  category: "advanced",
  description: "Copy a file to a new path or name; the original remains and must be deleted separately.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      old_path: { type: "string", description: "Current file path" },
      new_path: { type: "string", description: "Destination file path" },
      commit_message: { type: "string", description: "Commit message; generated if omitted" },
      branch: { type: "string", description: "Branch", default: "main" },
    },
    required: ["owner", "repo", "old_path", "new_path"],
  },
};

export async function moveFile(args: {
  owner?: string;
  repo?: string;
  old_path: string;
  new_path: string;
  commit_message?: string;
  branch?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { old_path, new_path, branch = "main" } = args;
  const commitMessage = args.commit_message || `Claude: move ${old_path} to ${new_path}`;

  try {
    const readResponse = await octokit.repos.getContent({ owner, repo, path: old_path, ref: branch });
    const data = readResponse.data;

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      logToolCall("move_file", { owner, repo, old_path, new_path }, "error", "Source is not a file");
      return { content: [{ type: "text", text: `Error: '${old_path}' is not a readable file.` }], isError: true };
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    let newFileSha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path: new_path, ref: branch });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        newFileSha = existing.data.sha;
      }
    } catch {
    }

    const writeResponse = await octokit.repos.createOrUpdateFileContents({
      owner, repo,
      path: new_path,
      message: commitMessage,
      content: Buffer.from(content).toString("base64"),
      branch,
      ...(newFileSha ? { sha: newFileSha } : {}),
    });

    const commitSha = writeResponse.data.commit.sha;
    const deleteUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${old_path}`;

    logToolCall("move_file", { owner, repo, old_path, new_path, branch }, "success", `commit: ${commitSha}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            path: new_path,
            commit_sha: commitSha,
            source_delete_url: deleteUrl,
          }),
        },
      ],
    };
  } catch (error: any) {
    const message = error.status === 404
      ? `Source file not found: '${old_path}' on branch '${branch}' in ${owner}/${repo}`
      : `Failed to move file: ${error.message}`;
    logToolCall("move_file", { owner, repo, old_path, new_path, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

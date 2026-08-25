import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const pushMultipleFilesSchema = {
  name: "push_multiple_files",
  category: "file",
  description: "Create or replace multiple files in one commit. Each file may use UTF-8 or base64.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            content: { type: "string", description: "Complete content; base64 when selected" },
            content_encoding: {
              type: "string",
              enum: ["utf-8", "base64"],
              description: "Content encoding; base64 is pre-encoded binary",
              default: "utf-8",
            },
          },
          required: ["path", "content"],
        },
        description: "Files to write",
      },
      commit_message: { type: "string", description: "Commit message; generated if omitted" },
      branch: { type: "string", description: "Branch", default: "main" },
    },
    required: ["owner", "repo", "files"],
  },
};

export async function pushMultipleFiles(args: {
  owner?: string;
  repo?: string;
  files: Array<{ path: string; content: string; content_encoding?: string }>;
  commit_message?: string;
  branch?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { files, branch = "main" } = args;
  const commitMessage = args.commit_message || `Claude: push ${files.length} files`;

  try {
    const refResponse = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const latestCommitSha = refResponse.data.object.sha;

    const commitResponse = await octokit.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
    const baseTreeSha = commitResponse.data.tree.sha;

    const tree = await Promise.all(
      files.map(async (file) => {
        const encoding = file.content_encoding || "utf-8";
        const blobContent = encoding === "base64"
          ? file.content
          : Buffer.from(file.content).toString("base64");

        const blob = await octokit.git.createBlob({
          owner, repo,
          content: blobContent,
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.data.sha,
        };
      })
    );

    const newTree = await octokit.git.createTree({ owner, repo, base_tree: baseTreeSha, tree });

    const newCommit = await octokit.git.createCommit({
      owner, repo,
      message: commitMessage,
      tree: newTree.data.sha,
      parents: [latestCommitSha],
    });

    await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.data.sha });

    const filePaths = files.map((f) => f.path);
    logToolCall("push_multiple_files", { owner, repo, files: filePaths, branch, commit_message: commitMessage }, "success", `commit: ${newCommit.data.sha}`);
    return {
      content: [
        {
          type: "text",
           text: JSON.stringify({ paths: filePaths, commit_sha: newCommit.data.sha }),
        },
      ],
    };
  } catch (error: any) {
    const message = `Failed to push multiple files: ${error.message}`;
    logToolCall("push_multiple_files", { owner, repo, fileCount: files.length, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

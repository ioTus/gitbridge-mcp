import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";
import { getWriteQueue } from "./queue_write.js";

export const flushQueueSchema = {
  name: "flush_queue",
  category: "advanced",
  description: "Commit queued writes for a branch in one commit. Add files first with queue_write.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      commit_message: { type: "string", description: "Commit message; generated if omitted" },
      branch: { type: "string", description: "Branch", default: "main" },
    },
    required: ["owner", "repo"],
  },
};

export async function flushQueue(args: {
  owner?: string;
  repo?: string;
  commit_message?: string;
  branch?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { branch = "main" } = args;

  const writeQueue = getWriteQueue();
  const key = `${owner}/${repo}/${branch}`;
  const repoQueue = writeQueue.get(key);

  if (!repoQueue || repoQueue.size === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No writes queued for ${owner}/${repo} on branch '${branch}'. Use queue_write to add files first.`,
        },
      ],
    };
  }

  const files = Array.from(repoQueue.entries()).map(([path, entry]) => ({
    path,
    content: entry.content,
    content_encoding: entry.content_encoding,
  }));
  const commitMessage = args.commit_message || `Claude: batch commit ${files.length} files`;

  try {
    const refResponse = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const latestCommitSha = refResponse.data.object.sha;

    const commitResponse = await octokit.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
    const baseTreeSha = commitResponse.data.tree.sha;

    const tree = await Promise.all(
      files.map(async (file) => {
        const blobContent = file.content_encoding === "base64"
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

    repoQueue.clear();
    if (repoQueue.size === 0) {
      writeQueue.delete(key);
    }

    const filePaths = files.map((f) => f.path);
    logToolCall("flush_queue", { owner, repo, fileCount: files.length, branch, commit_message: commitMessage }, "success", `commit: ${newCommit.data.sha}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ paths: filePaths, commit_sha: newCommit.data.sha }),
        },
      ],
    };
  } catch (error: any) {
    const message = `Failed to flush queue: ${error.message}`;
    logToolCall("flush_queue", { owner, repo, fileCount: files.length, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

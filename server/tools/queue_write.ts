import { validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

interface QueueEntry {
  content: string;
  branch: string;
  content_encoding: string;
}

const writeQueue: Map<string, Map<string, QueueEntry>> = new Map();

export function getWriteQueue(): Map<string, Map<string, QueueEntry>> {
  return writeQueue;
}

export const queueWriteSchema = {
  name: "queue_write",
  category: "advanced",
  description: "Queue a file write in memory for flush_queue to commit. Queue is lost on restart; supports UTF-8 or base64.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Complete content; base64 when selected" },
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

export async function queueWrite(args: {
  owner?: string;
  repo?: string;
  path: string;
  content: string;
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

  const key = `${owner}/${repo}/${branch}`;
  if (!writeQueue.has(key)) {
    writeQueue.set(key, new Map());
  }

  const repoQueue = writeQueue.get(key)!;
  const wasReplaced = repoQueue.has(path);
  repoQueue.set(path, { content, branch, content_encoding });

  logToolCall("queue_write", { owner, repo, path, branch, content_encoding }, "success", `queued (${repoQueue.size} pending)`);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          path,
          pending: repoQueue.size,
          replaced: wasReplaced,
        }),
      },
    ],
  };
}

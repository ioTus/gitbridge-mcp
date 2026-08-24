import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const listFilesSchema = {
  name: "list_files",
  category: "file",
  description: "List files and folders at a path",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      path: { type: "string", description: "Directory path", default: "" },
      branch: { type: "string", description: "Branch", default: "main" },
    },
    required: ["owner", "repo"],
  },
};

export async function listFiles(args: { owner?: string; repo?: string; path?: string; branch?: string }) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { path = "", branch = "main" } = args;

  try {
    const response = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    const data = response.data;

    if (!Array.isArray(data)) {
      logToolCall("list_files", { owner, repo, path, branch }, "error", "Path is a file, not a directory");
      return {
        content: [{ type: "text", text: `Error: '${path}' is a file, not a directory. Use read_files instead.` }],
        isError: true,
      };
    }

    const items = data.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type === "dir" ? "dir" : "file",
    }));

    logToolCall("list_files", { owner, repo, path, branch }, "success", `${items.length} items`);
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
  } catch (error: any) {
    const message = error.status === 404
      ? `Directory not found: '${path}' on branch '${branch}' in ${owner}/${repo}`
      : `Failed to list files: ${error.message}`;
    logToolCall("list_files", { owner, repo, path, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

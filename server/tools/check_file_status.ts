import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const checkFileStatusSchema = {
  name: "check_file_status",
  category: "file",
  description: "Returns file metadata (SHA, size, last-modified timestamp) without downloading file content. Use to check if a file has changed before doing a full read.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      path: { type: "string", description: "File path in the repo" },
      branch: { type: "string", description: "Branch name (default: main)", default: "main" },
    },
    required: ["owner", "repo", "path"],
  },
};

export async function checkFileStatus(args: { owner?: string; repo?: string; path: string; branch?: string }) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { path: filePath, branch = "main" } = args;

  try {
    const response = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });
    const data = response.data;

    if (Array.isArray(data)) {
      logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "error", "Path is a directory");
      return { content: [{ type: "text", text: `Error: '${filePath}' is a directory, not a file. Use list_files instead.` }], isError: true };
    }

    if (data.type !== "file") {
      logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "error", "Not a file");
      return { content: [{ type: "text", text: `Error: '${filePath}' is not a file (type: ${data.type}).` }], isError: true };
    }

    let lastModified: string | null = null;
    try {
      const commits = await octokit.repos.listCommits({
        owner,
        repo,
        path: filePath,
        sha: branch,
        per_page: 1,
      });
      if (commits.data.length > 0 && commits.data[0].commit.committer?.date) {
        lastModified = commits.data[0].commit.committer.date;
      }
    } catch (commitError: any) {
      logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "success", `last_modified unavailable: ${commitError.message}`);
    }

    const result = {
      path: filePath,
      sha: data.sha,
      size_bytes: data.size,
      last_modified: lastModified,
      exists: true,
    };

    logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "success", `sha=${data.sha.substring(0, 8)} size=${data.size}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    if (error.status === 404) {
      let branchExists = true;
      try {
        await octokit.repos.getBranch({ owner, repo, branch });
      } catch {
        branchExists = false;
      }

      if (!branchExists) {
        const msg = `Branch '${branch}' not found in ${owner}/${repo}`;
        logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "error", msg);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }

      const result = {
        path: filePath,
        sha: null,
        size_bytes: null,
        last_modified: null,
        exists: false,
      };
      logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "success", "file does not exist");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    const message = `Failed to check file status: ${error.message}`;
    logToolCall("check_file_status", { owner, repo, path: filePath, branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

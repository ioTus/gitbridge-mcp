import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const createBranchSchema = {
  name: "create_branch",
  category: "branch",
  description: "Create a new branch from an existing one",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      branch_name: { type: "string", description: "New branch name" },
      from_branch: { type: "string", description: "Source branch", default: "main" },
    },
    required: ["owner", "repo", "branch_name"],
  },
};

export async function createBranch(args: {
  owner?: string;
  repo?: string;
  branch_name: string;
  from_branch?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { branch_name, from_branch = "main" } = args;

  try {
    const sourceRef = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${from_branch}`,
    });
    const sha = sourceRef.data.object.sha;

    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch_name}`,
      sha,
    });

    logToolCall("create_branch", { owner, repo, branch_name, from_branch }, "success", `created from ${from_branch} at ${sha.slice(0, 7)}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            branch: branch_name,
            source_sha: sha,
            url: `https://github.com/${owner}/${repo}/tree/${branch_name}`,
          }),
        },
      ],
    };
  } catch (error: any) {
    let message: string;

    if (error.status === 404) {
      message = `Source branch "${from_branch}" not found in ${owner}/${repo}. Check the branch name and try again.`;
    } else if (error.status === 422) {
      message = `Branch "${branch_name}" already exists in ${owner}/${repo}.`;
    } else if (error.status === 403) {
      message = `Permission denied. Ensure your GitHub PAT has the 'repo' scope.`;
    } else {
      message = `Failed to create branch: ${error.message}`;
    }

    logToolCall("create_branch", { owner, repo, branch_name, from_branch }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

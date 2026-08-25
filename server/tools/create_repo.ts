import { octokit, logToolCall } from "../lib/github.js";

export const createRepoSchema = {
  name: "create_repo",
  category: "repo",
  description: "Create a user or organization repository.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Repository name; use hyphens, not spaces." },
      org: {
        type: "string",
        description: "Organization; omit for the authenticated user.",
      },
      description: { type: "string", description: "Repository description." },
      private: {
        type: "boolean",
        description: "Create a private repository.",
      },
      auto_init: {
        type: "boolean",
        description: "Create an initial README.",
      },
    },
    required: ["name"],
  },
};

export async function createRepo(args: {
  name: string;
  org?: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}) {
  const { name, org, description, auto_init = false } = args;
  const isPrivate = args.private !== false;

  try {
    let repoData: Awaited<ReturnType<typeof octokit.repos.createForAuthenticatedUser>>["data"];

    if (org) {
      const response = await octokit.repos.createInOrg({
        org,
        name,
        description,
        private: isPrivate,
        auto_init,
      });
      repoData = response.data as typeof repoData;
    } else {
      const response = await octokit.repos.createForAuthenticatedUser({
        name,
        description,
        private: isPrivate,
        auto_init,
      });
      repoData = response.data;
    }

    const target = org ? `${org}/${name}` : repoData.full_name;
    logToolCall("create_repo", { name, org, private: isPrivate }, "success", target);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            repository: repoData.full_name,
            url: repoData.html_url,
            default_branch: repoData.default_branch,
          }),
        },
      ],
    };
  } catch (error: any) {
    let message: string;

    if (error.status === 422) {
      message = `Repository name "${name}" is already taken${org ? ` in org "${org}"` : " on this account"}. Choose a different name.`;
    } else if (error.status === 403) {
      message = `Permission denied. Ensure your GitHub PAT has the 'repo' scope (for private repos) or 'public_repo' scope (for public repos).${org ? ` For org repos, the PAT also needs the 'admin:org' or appropriate org-level permission.` : ""}`;
    } else if (error.status === 401) {
      message = `Authentication failed. Check that GITHUB_PERSONAL_ACCESS_TOKEN is valid and not expired.`;
    } else {
      message = `Failed to create repository: ${error.message}`;
    }

    logToolCall("create_repo", { name, org }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

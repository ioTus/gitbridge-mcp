import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!token) {
  console.error("FATAL: GITHUB_PERSONAL_ACCESS_TOKEN is not set.");
  console.error("Please set this environment variable with a GitHub PAT that has 'repo' scope.");
  process.exit(1);
}

export const octokit = new Octokit({ auth: token });

const ALLOWED_REPOS: Set<string> | null = (() => {
  const raw = process.env.ALLOWED_REPOS;
  if (!raw) return null;
  const repos = raw.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (repos.length === 0) return null;
  console.log(`[${new Date().toISOString()}] [MCP] ALLOWED_REPOS: ${repos.join(", ")}`);
  return new Set(repos);
})();

export function validateOwnerRepo(args: { owner?: string; repo?: string }): { owner: string; repo: string } | { error: string } {
  if (!args.owner || !args.repo) {
    const missing = [];
    if (!args.owner) missing.push("owner");
    if (!args.repo) missing.push("repo");
    return {
      error: `Missing required parameters: ${missing.join(" and ")} must be provided on every tool call. Example: owner='yourUsername' repo='your-repo-name'`,
    };
  }
  if (ALLOWED_REPOS && !ALLOWED_REPOS.has(`${args.owner}/${args.repo}`.toLowerCase())) {
    return {
      error: `Repository ${args.owner}/${args.repo} is not in the allowed list. Contact the server administrator to add it to ALLOWED_REPOS.`,
    };
  }
  return { owner: args.owner, repo: args.repo };
}

export const ownerRepoParams = {
  owner: { type: "string" as const, description: "GitHub username or organization that owns the repository" },
  repo: { type: "string" as const, description: "Repository name" },
};

export function logToolCall(
  toolName: string,
  params: Record<string, any>,
  result: "success" | "error",
  details?: string
) {
  const timestamp = new Date().toISOString();
  const sanitizedParams = { ...params };
  if (sanitizedParams.token) sanitizedParams.token = "[REDACTED]";
  if (sanitizedParams.content && typeof sanitizedParams.content === "string" && sanitizedParams.content.length > 200) {
    sanitizedParams.content = sanitizedParams.content.substring(0, 200) + "...[truncated]";
  }
  console.log(
    `[${timestamp}] [MCP] ${toolName} | ${result.toUpperCase()} | params=${JSON.stringify(sanitizedParams)}${details ? ` | ${details}` : ""}`
  );
}

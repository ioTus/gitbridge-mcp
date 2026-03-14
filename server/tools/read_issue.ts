import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const readIssueSchema = {
  name: "read_issue",
  description: "Read the full body and comments of a GitHub Issue",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      issue_number: { type: "number", description: "Issue number to read" },
    },
    required: ["owner", "repo", "issue_number"],
  },
};

export async function readIssue(args: { owner?: string; repo?: string; issue_number: number }) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { issue_number } = args;

  try {
    const issueRes = await octokit.issues.get({ owner, repo, issue_number });
    const issue = issueRes.data;

    const comments: Awaited<ReturnType<typeof octokit.issues.listComments>>["data"] = [];
    let page = 1;
    while (true) {
      const batch = await octokit.issues.listComments({ owner, repo, issue_number, per_page: 100, page });
      comments.push(...batch.data);
      if (batch.data.length < 100) break;
      page++;
    }

    const labelNames = issue.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ");
    const assigneeNames = issue.assignees?.map((a) => a.login).join(", ") || "none";

    let output = `# Issue #${issue.number}: ${issue.title}\n`;
    output += `State: ${issue.state}\n`;
    output += `Labels: ${labelNames || "none"}\n`;
    output += `Assignees: ${assigneeNames}\n`;
    output += `Author: ${issue.user?.login || "unknown"}\n`;
    output += `Created: ${issue.created_at}\n`;
    output += `Updated: ${issue.updated_at}\n`;
    output += `URL: ${issue.html_url}\n`;
    output += `\n---\n\n`;
    output += issue.body || "(no body)";

    if (comments.length > 0) {
      output += `\n\n---\n\n## Comments (${comments.length})\n`;
      for (const comment of comments) {
        output += `\n### @${comment.user?.login || "unknown"} — ${comment.created_at}\n`;
        output += comment.body || "(empty comment)";
        output += "\n";
      }
    }

    logToolCall("read_issue", { owner, repo, issue_number }, "success", `${comments.length} comments`);
    return { content: [{ type: "text", text: output }] };
  } catch (error: any) {
    const message = error.status === 404
      ? `Issue #${issue_number} not found in ${owner}/${repo}`
      : `Failed to read issue: ${error.message}`;
    logToolCall("read_issue", { owner, repo, issue_number }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

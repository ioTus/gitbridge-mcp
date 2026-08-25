import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const addIssueCommentSchema = {
  name: "add_issue_comment",
  category: "issue",
  description: "Add a comment to an issue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      issue_number: { type: "number", description: "Issue number." },
      body: { type: "string", description: "Markdown comment." },
    },
    required: ["owner", "repo", "issue_number", "body"],
  },
};

export async function addIssueComment(args: { owner?: string; repo?: string; issue_number: number; body: string }) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { issue_number, body } = args;

  try {
    const response = await octokit.issues.createComment({ owner, repo, issue_number, body });

    logToolCall("add_issue_comment", { owner, repo, issue_number }, "success", response.data.html_url);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            issue_number,
            comment_url: response.data.html_url,
          }),
        },
      ],
    };
  } catch (error: any) {
    const message = error.status === 404
      ? `Issue #${issue_number} not found in ${owner}/${repo}`
      : `Failed to add comment: ${error.message}`;
    logToolCall("add_issue_comment", { owner, repo, issue_number }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

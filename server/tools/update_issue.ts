import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const updateIssueSchema = {
  name: "update_issue",
  category: "issue",
  description: "Update a GitHub issue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      issue_number: { type: "number", description: "Issue number." },
      title: { type: "string", description: "New title" },
      body: { type: "string", description: "New Markdown body." },
      state: { type: "string", description: "'open' or 'closed'", enum: ["open", "closed"] },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Replace all labels.",
      },
      assignees: {
        type: "array",
        items: { type: "string" },
        description: "Replace all assignees.",
      },
    },
    required: ["owner", "repo", "issue_number"],
  },
};

export async function updateIssue(args: {
  owner?: string;
  repo?: string;
  issue_number: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { issue_number, title, body, state, labels, assignees } = args;

  try {
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (state !== undefined) updateData.state = state;
    if (labels !== undefined) updateData.labels = labels;
    if (assignees !== undefined) updateData.assignees = assignees;

    const response = await octokit.issues.update({ owner, repo, issue_number, ...updateData });

    logToolCall("update_issue", { owner, repo, issue_number, ...updateData }, "success");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            issue_number,
            state: response.data.state,
            url: response.data.html_url,
          }),
        },
      ],
    };
  } catch (error: any) {
    const message = error.status === 404
      ? `Issue #${issue_number} not found in ${owner}/${repo}`
      : `Failed to update issue: ${error.message}`;
    logToolCall("update_issue", { owner, repo, issue_number }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

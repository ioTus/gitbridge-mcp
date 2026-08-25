import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const createIssueSchema = {
  name: "create_issue",
  category: "issue",
  description: "Create a GitHub issue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      title: { type: "string", description: "Issue title" },
      body: { type: "string", description: "Markdown issue body." },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Labels to apply.",
      },
      assignees: {
        type: "array",
        items: { type: "string" },
        description: "Assignee usernames.",
      },
    },
    required: ["owner", "repo", "title"],
  },
};

export async function createIssue(args: {
  owner?: string;
  repo?: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner, repo } = validated;
  const { title, body, labels, assignees } = args;

  try {
    const response = await octokit.issues.create({ owner, repo, title, body, labels, assignees });

    logToolCall("create_issue", { owner, repo, title }, "success", `#${response.data.number}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            issue_number: response.data.number,
            url: response.data.html_url,
          }),
        },
      ],
    };
  } catch (error: any) {
    const message = `Failed to create issue: ${error.message}`;
    logToolCall("create_issue", { owner, repo, title }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

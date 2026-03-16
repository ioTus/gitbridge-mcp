import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const moveIssueToColumnSchema = {
  name: "move_issue_to_column",
  category: "project",
  description: "Move an issue to a target column (status) on a GitHub Projects V2 board",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      issue_number: { type: "number", description: "Issue number to move" },
      column_name: { type: "string", description: "Target column name (e.g. 'In Progress', 'Done')" },
      project_number: { type: "number", description: "Project number (visible in the project URL)" },
    },
    required: ["owner", "repo", "issue_number", "column_name", "project_number"],
  },
};

interface FindItemResponse {
  user?: { projectV2: ProjectV2Data | null };
  organization?: { projectV2: ProjectV2Data | null };
}

interface ProjectV2Data {
  id: string;
  field: {
    __typename: string;
    id?: string;
    options?: Array<{ id: string; name: string }>;
  } | null;
  items: {
    nodes: Array<{
      id: string;
      content: {
        __typename: string;
        number?: number;
        repository?: { nameWithOwner: string };
      } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

const FIND_ITEM_QUERY = `
  query($owner: String!, $number: Int!, $cursor: String) {
    user(login: $owner) {
      projectV2(number: $number) {
        id
        field(name: "Status") {
          __typename
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
        items(first: 100, after: $cursor) {
          nodes {
            id
            content {
              __typename
              ... on Issue { number repository { nameWithOwner } }
              ... on PullRequest { number repository { nameWithOwner } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const ORG_FIND_ITEM_QUERY = `
  query($owner: String!, $number: Int!, $cursor: String) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        field(name: "Status") {
          __typename
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
        items(first: 100, after: $cursor) {
          nodes {
            id
            content {
              __typename
              ... on Issue { number repository { nameWithOwner } }
              ... on PullRequest { number repository { nameWithOwner } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const UPDATE_FIELD_MUTATION = `
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }
    ) {
      projectV2Item { id }
    }
  }
`;

export async function moveIssueToColumn(args: {
  owner?: string;
  repo?: string;
  issue_number: number;
  column_name: string;
  project_number: number;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
  }
  const { owner } = validated;
  const { issue_number, column_name, project_number } = args;

  try {
    let projectData: ProjectV2Data | null = null;
    let allItemNodes: ProjectV2Data["items"]["nodes"] = [];

    async function fetchProject(query: string): Promise<ProjectV2Data | null> {
      let cursor: string | null = null;
      let hasNextPage = true;
      let data: ProjectV2Data | null = null;

      while (hasNextPage) {
        const result = await octokit.graphql<FindItemResponse>(query, {
          owner,
          number: project_number,
          cursor,
        });

        const proj = result.user?.projectV2 ?? result.organization?.projectV2;
        if (!proj) return null;

        data = proj;
        allItemNodes.push(...proj.items.nodes);
        hasNextPage = proj.items.pageInfo.hasNextPage;
        cursor = proj.items.pageInfo.endCursor;
      }
      return data;
    }

    try {
      projectData = await fetchProject(FIND_ITEM_QUERY);
    } catch (userError: any) {
      if (userError.message?.includes("Could not resolve to a User") ||
          userError.errors?.some((e: any) => e.type === "NOT_FOUND")) {
        projectData = await fetchProject(ORG_FIND_ITEM_QUERY);
      } else {
        throw userError;
      }
    }

    if (!projectData) {
      const msg = `Project #${project_number} not found for owner "${owner}". Check the project number and that your PAT has the 'project' scope.`;
      logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "error", msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }

    if (!projectData.field || projectData.field.__typename !== "ProjectV2SingleSelectField") {
      const msg = `No "Status" single-select field found on project #${project_number}. The project board must have a Status field for column moves.`;
      logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "error", msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }

    const fieldId = projectData.field.id!;
    const options = projectData.field.options ?? [];
    const targetOption = options.find(
      (o) => o.name.toLowerCase() === column_name.toLowerCase()
    );

    if (!targetOption) {
      const available = options.map((o) => o.name).join(", ");
      const msg = `Column "${column_name}" not found. Available columns: ${available}`;
      logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "error", msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }

    const { repo } = validated;
    const expectedRepo = `${owner}/${repo}`.toLowerCase();
    const itemNode = allItemNodes.find(
      (n) =>
        n.content?.number === issue_number &&
        n.content?.repository?.nameWithOwner?.toLowerCase() === expectedRepo
    );

    if (!itemNode) {
      const msg = `Issue #${issue_number} from ${owner}/${repo} is not on project board #${project_number}. Add the issue to the project first, or check the repo name.`;
      logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "error", msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }

    await octokit.graphql(UPDATE_FIELD_MUTATION, {
      projectId: projectData.id,
      itemId: itemNode.id,
      fieldId,
      optionId: targetOption.id,
    });

    const output = `✅ Moved issue #${issue_number} to "${targetOption.name}" on project #${project_number}`;
    logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "success", `moved to "${targetOption.name}"`);
    return { content: [{ type: "text", text: output }] };
  } catch (error: any) {
    let message: string;

    if (error.message?.includes("Resource not accessible by personal access token") ||
        error.message?.includes("insufficient scopes")) {
      message = `Your GitHub PAT lacks the 'project' scope required for Projects V2 access. Add the 'project' scope to your PAT at https://github.com/settings/tokens and update GITHUB_PERSONAL_ACCESS_TOKEN.`;
    } else if (error.message?.includes("Could not resolve")) {
      message = `Project #${project_number} not found for owner "${owner}". Verify the project number and that your PAT can access it.`;
    } else {
      message = `Failed to move issue: ${error.message}`;
    }

    logToolCall("move_issue_to_column", { owner, issue_number, column_name, project_number }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

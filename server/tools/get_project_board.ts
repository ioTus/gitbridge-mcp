import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const getProjectBoardSchema = {
  name: "get_project_board",
  category: "project",
  description: "Read a GitHub Projects V2 board — returns columns (status values) and the issues/PRs in each column",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      project_number: { type: "number", description: "Project number (visible in the project URL)" },
    },
    required: ["owner", "project_number"],
  },
};

interface ProjectV2Item {
  content: {
    __typename: string;
    number?: number;
    title?: string;
  } | null;
  fieldValueByName: {
    __typename: string;
    name?: string;
  } | null;
}

interface ProjectV2Response {
  user?: {
    projectV2: {
      title: string;
      url: string;
      field: {
        __typename: string;
        options?: Array<{ name: string }>;
      } | null;
      items: {
        nodes: ProjectV2Item[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
  organization?: {
    projectV2: {
      title: string;
      url: string;
      field: {
        __typename: string;
        options?: Array<{ name: string }>;
      } | null;
      items: {
        nodes: ProjectV2Item[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
}

const PROJECT_QUERY = `
  query($owner: String!, $number: Int!, $cursor: String) {
    user(login: $owner) {
      projectV2(number: $number) {
        title
        url
        field(name: "Status") {
          __typename
          ... on ProjectV2SingleSelectField {
            options { name }
          }
        }
        items(first: 100, after: $cursor) {
          nodes {
            content {
              __typename
              ... on Issue { number title }
              ... on PullRequest { number title }
            }
            fieldValueByName(name: "Status") {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const ORG_PROJECT_QUERY = `
  query($owner: String!, $number: Int!, $cursor: String) {
    organization(login: $owner) {
      projectV2(number: $number) {
        title
        url
        field(name: "Status") {
          __typename
          ... on ProjectV2SingleSelectField {
            options { name }
          }
        }
        items(first: 100, after: $cursor) {
          nodes {
            content {
              __typename
              ... on Issue { number title }
              ... on PullRequest { number title }
            }
            fieldValueByName(name: "Status") {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

export async function getProjectBoard(args: {
  owner?: string;
  repo?: string;
  project_number: number;
}) {
  if (!args.owner) {
    return { content: [{ type: "text", text: "Error: Missing required parameter: owner must be provided on every tool call." }], isError: true };
  }
  if (args.repo) {
    const validated = validateOwnerRepo(args);
    if ("error" in validated) {
      return { content: [{ type: "text", text: `Error: ${validated.error}` }], isError: true };
    }
  }
  const owner = args.owner;
  const { project_number } = args;

  try {
    let project: ProjectV2Response["user"] extends undefined ? never : NonNullable<ProjectV2Response["user"]>["projectV2"] | undefined;
    let allItems: ProjectV2Item[] = [];

    let isOrg = false;
    try {
      let cursor: string | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const result = await octokit.graphql<ProjectV2Response>(PROJECT_QUERY, {
          owner,
          number: project_number,
          cursor,
        });

        if (result.user?.projectV2) {
          project = result.user.projectV2;
          allItems.push(...result.user.projectV2.items.nodes);
          hasNextPage = result.user.projectV2.items.pageInfo.hasNextPage;
          cursor = result.user.projectV2.items.pageInfo.endCursor;
        } else {
          hasNextPage = false;
        }
      }
    } catch (userError: any) {
      if (userError.message?.includes("Could not resolve to a User") ||
          userError.errors?.some((e: any) => e.type === "NOT_FOUND")) {
        isOrg = true;
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage) {
          const result = await octokit.graphql<ProjectV2Response>(ORG_PROJECT_QUERY, {
            owner,
            number: project_number,
            cursor,
          });

          if (result.organization?.projectV2) {
            project = result.organization.projectV2;
            allItems.push(...result.organization.projectV2.items.nodes);
            hasNextPage = result.organization.projectV2.items.pageInfo.hasNextPage;
            cursor = result.organization.projectV2.items.pageInfo.endCursor;
          } else {
            hasNextPage = false;
          }
        }
      } else {
        throw userError;
      }
    }

    if (!project) {
      const msg = `Project #${project_number} not found for owner "${owner}". Check that the project number is correct and your PAT has the 'project' scope.`;
      logToolCall("get_project_board", { owner, project_number }, "error", msg);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }

    const columns: string[] = project.field?.options?.map((o) => o.name) ?? [];

    const grouped: Record<string, Array<{ type: string; number: number; title: string }>> = {};
    for (const col of columns) {
      grouped[col] = [];
    }
    grouped["No Status"] = [];

    for (const item of allItems) {
      if (!item.content || !item.content.number) continue;
      const status = item.fieldValueByName?.name ?? "No Status";
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push({
        type: item.content.__typename,
        number: item.content.number,
        title: item.content.title ?? "(untitled)",
      });
    }

    let output = `# ${project.title}\n`;
    output += `URL: ${project.url}\n`;
    output += `Columns: ${columns.join(", ") || "(no Status field found)"}\n`;
    output += `Total items: ${allItems.filter((i) => i.content?.number).length}\n`;

    const columnOrder = [...columns, "No Status"];
    for (const col of columnOrder) {
      const items = grouped[col];
      if (!items || items.length === 0) continue;
      output += `\n## ${col} (${items.length})\n`;
      for (const item of items) {
        const prefix = item.type === "PullRequest" ? "PR" : "Issue";
        output += `- ${prefix} #${item.number}: ${item.title}\n`;
      }
    }

    logToolCall("get_project_board", { owner, project_number }, "success", `${allItems.length} items across ${columns.length} columns`);
    return { content: [{ type: "text", text: output }] };
  } catch (error: any) {
    let message: string;

    if (error.message?.includes("Resource not accessible by personal access token") ||
        error.message?.includes("insufficient scopes")) {
      message = `Your GitHub PAT lacks the 'project' scope required for Projects V2 access. Add the 'project' scope to your PAT at https://github.com/settings/tokens and update GITHUB_PERSONAL_ACCESS_TOKEN.`;
    } else if (error.message?.includes("Could not resolve")) {
      message = `Project #${project_number} not found for owner "${owner}". Verify the project number and that your PAT can access it.`;
    } else {
      message = `Failed to read project board: ${error.message}`;
    }

    logToolCall("get_project_board", { owner, project_number }, "error", message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

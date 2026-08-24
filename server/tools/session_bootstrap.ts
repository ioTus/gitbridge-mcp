import {
  ownerRepoParams,
  validateOwnerRepo,
} from "../lib/github.js";
import { listFiles } from "./list_files.js";
import { readFiles } from "./read_files.js";

export const SESSION_BOOTSTRAP_MAX_EXTRAS = 19;

export const sessionBootstrapSchema = {
  name: "session_bootstrap",
  category: "file",
  description:
    'Bootstrap an IME session in one call: root listing plus IME.md and up to 19 extra files, with ordered inline errors and a shared 256 KiB content budget. Missing IME.md means the repo is not IME-initialized; stop and surface that state.',
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      extras: {
        type: "array",
        items: { type: "string" },
        maxItems: SESSION_BOOTSTRAP_MAX_EXTRAS,
        description: "Additional startup file paths",
        default: [],
      },
      branch: {
        type: "string",
        description: "Branch",
        default: "main",
      },
    },
    required: ["owner", "repo"],
  },
};

interface SessionBootstrapArgs {
  owner?: string;
  repo?: string;
  extras?: unknown;
  branch?: unknown;
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

interface SessionBootstrapDependencies {
  list?: (args: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
  }) => Promise<ToolResult>;
  read?: (args: {
    owner: string;
    repo: string;
    paths: string[];
    branch: string;
  }) => Promise<ToolResult>;
}

function topLevelError(message: string) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function inlineRoot(result: ToolResult) {
  const text = result.content[0]?.text ?? "Error: Root listing unavailable";
  if (result.isError) {
    return { error: text.replace(/^Error:\s*/, "") };
  }
  try {
    const items = JSON.parse(text);
    return Array.isArray(items)
      ? { items }
      : { error: "Invalid root listing response" };
  } catch {
    return { error: "Invalid root listing response" };
  }
}

export async function sessionBootstrap(
  args: SessionBootstrapArgs,
  dependencies: SessionBootstrapDependencies = {},
) {
  if (
    typeof args.owner !== "string" ||
    !args.owner ||
    typeof args.repo !== "string" ||
    !args.repo
  ) {
    return topLevelError("owner and repo must be non-empty strings.");
  }
  const validated = validateOwnerRepo(args);
  if ("error" in validated) return topLevelError(validated.error);
  const { owner, repo } = validated;
  const extras = args.extras ?? [];
  const branch = args.branch ?? "main";

  if (
    !Array.isArray(extras) ||
    extras.length > SESSION_BOOTSTRAP_MAX_EXTRAS ||
    extras.some((path) => typeof path !== "string" || !path)
  ) {
    return topLevelError(
      "extras must contain at most 19 non-empty file paths.",
    );
  }
  if (typeof branch !== "string" || !branch) {
    return topLevelError("branch must be a non-empty string.");
  }

  const list = dependencies.list ?? listFiles;
  const read = dependencies.read ?? readFiles;
  const [rootResult, filesResult] = await Promise.all([
    list({ owner, repo, path: "", branch }),
    read({
      owner,
      repo,
      paths: ["IME.md", ...(extras as string[])],
      branch,
    }),
  ]);

  let files: unknown;
  try {
    files = JSON.parse(filesResult.content[0]?.text ?? "");
  } catch {
    files = [
      {
        path: "IME.md",
        error: "invalid_batch_response",
      },
    ];
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            root: inlineRoot(rootResult),
            files,
          },
          null,
          2,
        ),
      },
    ],
  };
}
import { createHash } from "crypto";

const SECRET_FIELD_PATTERN = /token|secret|password|key|auth/i;
const MAX_FIELD_BYTES = 4 * 1024;

export interface RedactedDigest {
  length: number;
  sha256_prefix: string;
}

export function digestField(value: unknown): RedactedDigest {
  const str =
    typeof value === "string" ? value : JSON.stringify(value ?? null);
  const bytes = Buffer.byteLength(str, "utf8");
  const hash = createHash("sha256")
    .update(str, "utf8")
    .digest("hex")
    .slice(0, 8);
  return { length: bytes, sha256_prefix: hash };
}

export interface ToolAllowList {
  keep: readonly string[];
  digest: readonly string[];
}

const OR = ["owner", "repo"] as const;

export const TOOL_ALLOW_LISTS: Record<string, ToolAllowList> = {
  read_files: {
    keep: [
      ...OR,
      "paths",
      "branch",
      "content_encoding",
      "metadata_only",
    ],
    digest: [],
  },
  session_bootstrap: {
    keep: [...OR, "extras", "branch"],
    digest: [],
  },
  patch_multiple_files: {
    keep: [...OR, "branch"],
    digest: ["files"],
  },
  push_multiple_files: {
    keep: [...OR, "branch"],
    digest: ["files", "commit_message"],
  },
  list_files: {
    keep: [...OR, "path", "branch"],
    digest: [],
  },
  search_files: {
    keep: [...OR, "query", "path", "extension"],
    digest: [],
  },
  get_recent_commits: {
    keep: [...OR, "branch", "limit"],
    digest: [],
  },
  get_file_diff: {
    keep: [...OR, "commit_sha", "path", "branch"],
    digest: [],
  },
  create_branch: {
    keep: [...OR, "branch_name", "from_branch"],
    digest: [],
  },
  list_branches: {
    keep: [...OR, "limit"],
    digest: [],
  },
  move_file: {
    keep: [...OR, "old_path", "new_path", "branch"],
    digest: ["commit_message"],
  },
  delete_file: {
    keep: [...OR, "path", "branch"],
    digest: ["commit_message"],
  },
  queue_write: {
    keep: [...OR, "path", "branch", "content_encoding"],
    digest: ["content"],
  },
  flush_queue: {
    keep: [...OR, "branch"],
    digest: ["commit_message"],
  },
  create_repo: {
    keep: ["name", "org", "private", "auto_init"],
    digest: ["description"],
  },
  create_issue: {
    keep: [...OR, "labels", "assignees"],
    digest: ["title", "body"],
  },
  update_issue: {
    keep: [...OR, "issue_number", "state", "labels", "assignees"],
    digest: ["title", "body"],
  },
  list_issues: {
    keep: [...OR, "state", "labels", "limit"],
    digest: [],
  },
  add_issue_comment: {
    keep: [...OR, "issue_number"],
    digest: ["body"],
  },
  read_issue: {
    keep: [...OR, "issue_number"],
    digest: [],
  },
  get_project_board: {
    keep: ["owner", "project_number"],
    digest: [],
  },
  move_issue_to_column: {
    keep: [...OR, "issue_number", "column_name", "project_number"],
    digest: [],
  },
};

function fieldByteSize(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function redactToolArgs(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};

  const policy = TOOL_ALLOW_LISTS[toolName];
  if (!policy) return {};

  const keep = new Set(policy.keep);
  const digest = new Set(policy.digest);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (SECRET_FIELD_PATTERN.test(key)) continue;
    if (fieldByteSize(value) > MAX_FIELD_BYTES) continue;

    if (digest.has(key)) {
      out[key] = digestField(value);
      continue;
    }
    if (!keep.has(key)) continue;

    out[key] = value;
  }

  return out;
}

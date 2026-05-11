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

const COMMON_OWNER_REPO = ["owner", "repo"] as const;

export const TOOL_ALLOW_LISTS: Record<string, ToolAllowList> = {
  read_file: {
    keep: [...COMMON_OWNER_REPO, "path", "ref", "content_encoding"],
    digest: [],
  },
  write_file: {
    keep: [...COMMON_OWNER_REPO, "path", "branch", "content_encoding"],
    digest: ["content", "message"],
  },
  patch_file: {
    keep: [...COMMON_OWNER_REPO, "path", "branch"],
    digest: ["message"],
  },
  patch_multiple_files: {
    keep: [...COMMON_OWNER_REPO, "branch"],
    digest: ["message"],
  },
  push_multiple_files: {
    keep: [...COMMON_OWNER_REPO, "branch"],
    digest: ["message"],
  },
  list_files: {
    keep: [...COMMON_OWNER_REPO, "path", "ref"],
    digest: [],
  },
  check_file_status: {
    keep: [...COMMON_OWNER_REPO, "path", "ref"],
    digest: [],
  },
  search_files: {
    keep: [...COMMON_OWNER_REPO, "query"],
    digest: [],
  },
  get_recent_commits: {
    keep: [...COMMON_OWNER_REPO, "branch", "limit"],
    digest: [],
  },
  get_file_diff: {
    keep: [...COMMON_OWNER_REPO, "path", "base", "head"],
    digest: [],
  },
  create_branch: {
    keep: [...COMMON_OWNER_REPO, "branch", "from_ref"],
    digest: [],
  },
  list_branches: {
    keep: [...COMMON_OWNER_REPO],
    digest: [],
  },
  move_file: {
    keep: [...COMMON_OWNER_REPO, "from_path", "to_path", "branch"],
    digest: ["message"],
  },
  delete_file: {
    keep: [...COMMON_OWNER_REPO, "path", "branch"],
    digest: ["message"],
  },
  queue_write: {
    keep: [...COMMON_OWNER_REPO, "path", "branch", "content_encoding"],
    digest: ["content", "message"],
  },
  flush_queue: {
    keep: [...COMMON_OWNER_REPO, "branch"],
    digest: ["message"],
  },
  create_repo: {
    keep: ["name", "private"],
    digest: ["description"],
  },
  create_issue: {
    keep: [...COMMON_OWNER_REPO, "labels"],
    digest: ["title", "body"],
  },
  update_issue: {
    keep: [...COMMON_OWNER_REPO, "issue_number", "state", "labels"],
    digest: ["title", "body"],
  },
  list_issues: {
    keep: [...COMMON_OWNER_REPO, "state", "labels"],
    digest: [],
  },
  add_issue_comment: {
    keep: [...COMMON_OWNER_REPO, "issue_number"],
    digest: ["body"],
  },
  read_issue: {
    keep: [...COMMON_OWNER_REPO, "issue_number"],
    digest: [],
  },
  get_project_board: {
    keep: [...COMMON_OWNER_REPO, "project_number"],
    digest: [],
  },
  move_issue_to_column: {
    keep: [...COMMON_OWNER_REPO, "issue_number", "column_id"],
    digest: [],
  },
};

function withinSizeBudget(value: unknown): boolean {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8") <= MAX_FIELD_BYTES;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_FIELD_BYTES;
    } catch {
      return false;
    }
  }
  return true;
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

    if (digest.has(key)) {
      out[key] = digestField(value);
      continue;
    }

    if (!keep.has(key)) continue;
    if (!withinSizeBudget(value)) continue;

    if (Array.isArray(value)) {
      out[key] = value;
    } else if (typeof value === "object" && value !== null) {
      out[key] = value;
    } else {
      out[key] = value;
    }
  }

  return out;
}

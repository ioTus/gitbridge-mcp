import { createHash } from "crypto";

const SAFE_FIELDS = new Set([
  "owner",
  "repo",
  "branch",
  "path",
  "from_path",
  "to_path",
  "sha",
  "ref",
  "from_ref",
  "base",
  "head",
  "issue_number",
  "column_id",
  "project_number",
  "query",
  "state",
  "labels",
  "limit",
  "content_encoding",
  "private",
  "name",
]);

const DIGEST_FIELDS = new Set([
  "content",
  "body",
  "title",
  "message",
  "description",
]);

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

export function redactToolArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (SECRET_FIELD_PATTERN.test(key)) continue;

    if (DIGEST_FIELDS.has(key)) {
      out[key] = digestField(value);
      continue;
    }

    if (key === "files" && Array.isArray(value)) {
      out.files = `[array length=${value.length}]`;
      continue;
    }

    if (!SAFE_FIELDS.has(key)) continue;

    if (typeof value === "string") {
      if (Buffer.byteLength(value, "utf8") > MAX_FIELD_BYTES) continue;
      out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json, "utf8") > MAX_FIELD_BYTES) {
        out[key] = `[array length=${value.length}]`;
      } else {
        out[key] = value;
      }
    } else if (value !== null && typeof value === "object") {
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json, "utf8") > MAX_FIELD_BYTES) continue;
      out[key] = value;
    } else if (value === null) {
      out[key] = null;
    }
  }
  return out;
}

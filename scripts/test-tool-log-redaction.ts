import {
  redactToolArgs,
  digestField,
  TOOL_ALLOW_LISTS,
} from "../server/lib/tool-log-redaction.js";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

console.log("Test: write_file — strips sensitive and unknown fields");

const bigString = "x".repeat(10 * 1024);
const writeArgs = {
  owner: "ioTus",
  repo: "gitbridge-mcp",
  path: "server/routes.ts",
  branch: "main",
  content: "raw file body that should never be persisted",
  message: "commit message that should never be persisted",
  content_encoding: "utf-8",
  token: "ghp_supersecret",
  secret: "shh",
  password: "hunter2",
  github_token: "ghp_other",
  oauth_key: "leak",
  authorization: "Bearer xxx",
  some_unknown_field: "should be dropped",
  bigPayload: bigString,
};

const w = redactToolArgs("write_file", writeArgs);
const wJson = JSON.stringify(w);

assert(w.owner === "ioTus", "owner kept");
assert(w.repo === "gitbridge-mcp", "repo kept");
assert(w.path === "server/routes.ts", "path kept");
assert(w.branch === "main", "branch kept");
assert(w.content_encoding === "utf-8", "content_encoding kept");

assert(
  typeof w.content === "object" && (w.content as any).sha256_prefix,
  "content replaced with digest",
);
assert(
  typeof w.message === "object" && (w.message as any).sha256_prefix,
  "message replaced with digest",
);

assert(!("token" in w), "token field dropped");
assert(!("secret" in w), "secret field dropped");
assert(!("password" in w), "password field dropped");
assert(!("github_token" in w), "github_token dropped (matches /token/)");
assert(!("oauth_key" in w), "oauth_key dropped (matches /key|auth/)");
assert(!("authorization" in w), "authorization dropped (matches /auth/)");
assert(!("some_unknown_field" in w), "unknown field dropped (per-tool allow-list)");
assert(!("bigPayload" in w), "10KB payload dropped (>4KB cap)");

assert(!wJson.includes("raw file body"), "raw content body not in output");
assert(!wJson.includes("commit message that"), "raw commit message not in output");
assert(!wJson.includes("ghp_supersecret"), "raw token value not in output");
assert(!wJson.includes("hunter2"), "raw password not in output");
assert(!wJson.includes("Bearer xxx"), "raw bearer not in output");
assert(!wJson.includes("should be dropped"), "unknown field value not in output");
assert(!wJson.includes(bigString), "10KB payload value not in output");

console.log("\nTest: create_issue — title and body digested, labels kept");
const issueArgs = {
  owner: "ioTus",
  repo: "gitbridge-mcp",
  title: "issue title that should never be persisted",
  body: "issue body that should never be persisted",
  labels: ["bug", "p1"],
  branch: "main",
};
const i = redactToolArgs("create_issue", issueArgs);
const iJson = JSON.stringify(i);
assert(typeof i.title === "object" && (i.title as any).sha256_prefix, "title digested");
assert(typeof i.body === "object" && (i.body as any).sha256_prefix, "body digested");
assert(Array.isArray(i.labels) && (i.labels as any[]).length === 2, "labels kept");
assert(!("branch" in i), "branch dropped (not in create_issue allow-list)");
assert(!iJson.includes("issue title that"), "raw title not in output");
assert(!iJson.includes("issue body that"), "raw body not in output");

console.log("\nTest: read_file — only safe path/ref kept");
const r = redactToolArgs("read_file", {
  owner: "o",
  repo: "r",
  path: "README.md",
  ref: "main",
  content: "should never appear",
});
assert(r.path === "README.md", "read_file path kept");
assert(r.ref === "main", "read_file ref kept");
assert(!("content" in r), "read_file: content not in allow-list, dropped");
assert(!JSON.stringify(r).includes("should never appear"), "no leaked content");

console.log("\nTest: search_files — query kept");
const s = redactToolArgs("search_files", { owner: "o", repo: "r", query: "TODO" });
assert(s.query === "TODO", "search_files query kept");

console.log("\nTest: unknown tool name — empty record");
const u = redactToolArgs("nonexistent_tool", { owner: "o", repo: "r", path: "x" });
assert(JSON.stringify(u) === "{}", "unknown tool returns empty (default-drop)");

console.log("\nTest: digest helper");
const d = digestField("hello world");
assert(d.length === 11, "digest length matches byte size");
assert(/^[0-9a-f]{8}$/.test(d.sha256_prefix), "digest prefix is 8 hex chars");

console.log("\nTest: every registered tool has an allow-list");
const registeredTools = [
  "read_file","write_file","push_multiple_files","list_files","create_issue",
  "update_issue","list_issues","add_issue_comment","read_issue","search_files",
  "move_file","delete_file","queue_write","flush_queue","get_recent_commits",
  "create_repo","create_branch","list_branches","get_file_diff",
  "get_project_board","move_issue_to_column","patch_file",
  "patch_multiple_files","check_file_status",
];
for (const t of registeredTools) {
  assert(TOOL_ALLOW_LISTS[t] !== undefined, `${t} has allow-list`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

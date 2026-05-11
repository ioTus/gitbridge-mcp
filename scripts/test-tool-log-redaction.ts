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

console.log("Test: write_file — actual schema fields kept/digested");
const bigString = "x".repeat(10 * 1024);
const w = redactToolArgs("write_file", {
  owner: "ioTus",
  repo: "gitbridge-mcp",
  path: "server/routes.ts",
  branch: "main",
  content: "raw file body that should never be persisted",
  commit_message: "raw commit message that should never be persisted",
  content_encoding: "utf-8",
  token: "ghp_supersecret",
  secret: "shh",
  password: "hunter2",
  github_token: "ghp_other",
  oauth_key: "leak",
  authorization: "Bearer xxx",
  some_unknown_field: "should be dropped",
  bigPayload: bigString,
});
const wJson = JSON.stringify(w);
assert(w.owner === "ioTus", "owner kept");
assert(w.path === "server/routes.ts", "path kept");
assert(w.branch === "main", "branch kept");
assert(w.content_encoding === "utf-8", "content_encoding kept");
assert(typeof w.content === "object" && (w.content as any).sha256_prefix, "content digested");
assert(typeof w.commit_message === "object" && (w.commit_message as any).sha256_prefix, "commit_message digested (correct schema name)");
assert(!("token" in w), "token dropped");
assert(!("secret" in w), "secret dropped");
assert(!("password" in w), "password dropped");
assert(!("github_token" in w), "github_token dropped");
assert(!("oauth_key" in w), "oauth_key dropped");
assert(!("authorization" in w), "authorization dropped");
assert(!("some_unknown_field" in w), "unknown field dropped");
assert(!("bigPayload" in w), "10KB payload dropped");
assert(!wJson.includes("raw file body"), "raw content body not in output");
assert(!wJson.includes("raw commit message"), "raw commit_message not in output");
assert(!wJson.includes("ghp_supersecret"), "raw token not in output");
assert(!wJson.includes(bigString), "big payload not in output");

console.log("\nTest: 4KB cap applies to digest fields too");
const oversizedDigest = redactToolArgs("write_file", {
  owner: "o",
  repo: "r",
  path: "p",
  content: "ok small",
  commit_message: "y".repeat(10 * 1024),
});
assert(typeof oversizedDigest.content === "object", "small content still digested");
assert(!("commit_message" in oversizedDigest), "oversized commit_message dropped, not digested");

console.log("\nTest: create_branch — branch_name and from_branch (actual schema)");
const cb = redactToolArgs("create_branch", {
  owner: "o", repo: "r",
  branch_name: "feature/x",
  from_branch: "main",
  branch: "should-be-dropped",
});
assert(cb.branch_name === "feature/x", "branch_name kept");
assert(cb.from_branch === "main", "from_branch kept");
assert(!("branch" in cb), "stray 'branch' (not in schema) dropped");

console.log("\nTest: move_file — old_path/new_path + commit_message digest");
const mf = redactToolArgs("move_file", {
  owner: "o", repo: "r",
  old_path: "a.ts",
  new_path: "b.ts",
  commit_message: "rename",
  branch: "main",
});
assert(mf.old_path === "a.ts", "old_path kept");
assert(mf.new_path === "b.ts", "new_path kept");
assert(typeof mf.commit_message === "object" && (mf.commit_message as any).sha256_prefix, "move_file commit_message digested");
assert(mf.branch === "main", "move_file branch kept");

console.log("\nTest: delete_file — commit_message digest, no leak");
const df = redactToolArgs("delete_file", {
  owner: "o", repo: "r",
  path: "x.ts",
  commit_message: "delete this",
  branch: "main",
});
assert(typeof df.commit_message === "object", "delete_file commit_message digested");
assert(!JSON.stringify(df).includes("delete this"), "no commit_message leak");

console.log("\nTest: flush_queue — commit_message digest");
const fq = redactToolArgs("flush_queue", {
  owner: "o", repo: "r",
  commit_message: "batch commit",
  branch: "main",
});
assert(typeof fq.commit_message === "object", "flush_queue commit_message digested");

console.log("\nTest: move_issue_to_column — column_name + project_number (actual schema)");
const mc = redactToolArgs("move_issue_to_column", {
  owner: "o", repo: "r",
  issue_number: 42,
  column_name: "Done",
  project_number: 7,
  column_id: "should-drop",
});
assert(mc.column_name === "Done", "column_name kept");
assert(mc.project_number === 7, "project_number kept");
assert(mc.issue_number === 42, "issue_number kept");
assert(!("column_id" in mc), "stale column_id dropped");

console.log("\nTest: get_file_diff — commit_sha kept");
const gd = redactToolArgs("get_file_diff", {
  owner: "o", repo: "r",
  commit_sha: "abc123",
  path: "x.ts",
  branch: "main",
});
assert(gd.commit_sha === "abc123", "commit_sha kept");

console.log("\nTest: search_files — query + path + extension kept");
const sf = redactToolArgs("search_files", {
  owner: "o", repo: "r",
  query: "TODO",
  path: "src",
  extension: "ts",
});
assert(sf.query === "TODO" && sf.path === "src" && sf.extension === "ts", "search_files keeps all");

console.log("\nTest: create_issue — title/body digested, labels+assignees kept");
const ci = redactToolArgs("create_issue", {
  owner: "o", repo: "r",
  title: "raw title",
  body: "raw body",
  labels: ["bug"],
  assignees: ["ioTus"],
});
assert(typeof ci.title === "object", "title digested");
assert(typeof ci.body === "object", "body digested");
assert(Array.isArray(ci.labels), "labels kept");
assert(Array.isArray(ci.assignees), "assignees kept");

console.log("\nTest: create_repo — description digested");
const cr = redactToolArgs("create_repo", {
  name: "x", org: "ioTus", description: "raw desc", private: true, auto_init: false,
});
assert(cr.name === "x" && cr.org === "ioTus" && cr.private === true && cr.auto_init === false, "create_repo flags kept");
assert(typeof cr.description === "object", "description digested");

console.log("\nTest: read_file — content not in allow-list, dropped");
const r = redactToolArgs("read_file", {
  owner: "o", repo: "r", path: "x", branch: "main",
  content: "should never appear",
});
assert(!("content" in r), "read_file: content dropped");

console.log("\nTest: unknown tool name — empty record");
assert(JSON.stringify(redactToolArgs("nonexistent_tool", { owner: "o" })) === "{}", "unknown tool returns empty");

console.log("\nTest: digest helper");
const d = digestField("hello world");
assert(d.length === 11, "digest byte length");
assert(/^[0-9a-f]{8}$/.test(d.sha256_prefix), "digest 8 hex chars");

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

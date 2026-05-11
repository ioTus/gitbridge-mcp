import { redactToolArgs, digestField } from "../server/lib/tool-log-redaction.js";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`  ok: ${msg}`);
  }
}

console.log("Test: redactToolArgs strips sensitive and unknown fields");

const bigString = "x".repeat(10 * 1024);
const input = {
  owner: "ioTus",
  repo: "gitbridge-mcp",
  path: "server/routes.ts",
  branch: "main",
  sha: "abc123",
  content: "raw file body that should never be persisted",
  body: "issue body that should never be persisted",
  title: "issue title that should never be persisted",
  message: "commit message that should never be persisted",
  description: "repo description that should never be persisted",
  token: "ghp_supersecret",
  secret: "shh",
  password: "hunter2",
  github_token: "ghp_other",
  oauth_key: "leak",
  authorization: "Bearer xxx",
  some_unknown_field: "should be dropped",
  bigPayload: bigString,
  ref: "refs/heads/main",
  issue_number: 42,
  query: "SearchTerm",
};

const out = redactToolArgs(input);
const json = JSON.stringify(out);

assert(out.owner === "ioTus", "owner kept");
assert(out.repo === "gitbridge-mcp", "repo kept");
assert(out.path === "server/routes.ts", "path kept");
assert(out.branch === "main", "branch kept");
assert(out.sha === "abc123", "sha kept");
assert(out.ref === "refs/heads/main", "ref kept");
assert(out.issue_number === 42, "issue_number kept");
assert(out.query === "SearchTerm", "query kept");

assert(
  typeof out.content === "object" && (out.content as any).length > 0 && (out.content as any).sha256_prefix,
  "content replaced with digest",
);
assert(
  typeof out.body === "object" && (out.body as any).sha256_prefix,
  "body replaced with digest",
);
assert(
  typeof out.title === "object" && (out.title as any).sha256_prefix,
  "title replaced with digest",
);
assert(
  typeof out.message === "object" && (out.message as any).sha256_prefix,
  "message replaced with digest",
);
assert(
  typeof out.description === "object" && (out.description as any).sha256_prefix,
  "description replaced with digest",
);

assert(!("token" in out), "token field dropped");
assert(!("secret" in out), "secret field dropped");
assert(!("password" in out), "password field dropped");
assert(!("github_token" in out), "github_token dropped (matches /token/)");
assert(!("oauth_key" in out), "oauth_key dropped (matches /key|auth/)");
assert(!("authorization" in out), "authorization dropped (matches /auth/)");

assert(!("some_unknown_field" in out), "unknown field dropped (allow-list)");
assert(!("bigPayload" in out), "10KB payload dropped (>4KB cap)");

assert(!json.includes("raw file body"), "raw content body not in output");
assert(!json.includes("issue body that"), "raw issue body not in output");
assert(!json.includes("issue title that"), "raw title not in output");
assert(!json.includes("commit message that"), "raw commit message not in output");
assert(!json.includes("repo description"), "raw description not in output");
assert(!json.includes("ghp_supersecret"), "raw token value not in output");
assert(!json.includes("hunter2"), "raw password not in output");
assert(!json.includes("Bearer xxx"), "raw bearer not in output");
assert(!json.includes("should be dropped"), "unknown field value not in output");
assert(!json.includes(bigString), "10KB payload value not in output");

const d = digestField("hello world");
assert(d.length === 11, "digest length matches byte size");
assert(/^[0-9a-f]{8}$/.test(d.sha256_prefix), "digest prefix is 8 hex chars");

const empty = redactToolArgs(undefined);
assert(JSON.stringify(empty) === "{}", "undefined args -> {}");

const filesInput = {
  owner: "o",
  repo: "r",
  files: [{ path: "a", content: "x" }, { path: "b", content: "y" }],
};
const filesOut = redactToolArgs(filesInput);
assert(
  filesOut.files === "[array length=2]",
  "files array replaced with length-only marker",
);
assert(
  !JSON.stringify(filesOut).includes('"x"'),
  "file content not leaked through files array",
);

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

import assert from "node:assert/strict";
import { allToolSchemas } from "../server/tools/registry.js";
import {
  addResponseFormat,
  formatToolResponse,
  splitResponseFormat,
} from "../server/tools/response-format.js";

const text = (value: string, isError = false) => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError: true } : {}),
});
const responseText = (result: ReturnType<typeof text>) => result.content[0].text;

assert.equal(allToolSchemas.length, 22);
for (const schema of allToolSchemas) {
  assert.deepEqual(schema.inputSchema.properties.format.enum, ["compact", "pretty"]);
  assert.equal(schema.inputSchema.properties.format.default, "compact");
}
const injected = addResponseFormat({
  name: "example", category: "test", description: "test",
  inputSchema: { type: "object", properties: {} },
});
assert.equal(injected.inputSchema.properties.format.default, "compact");

assert.deepEqual(splitResponseFormat({ format: "pretty", path: "a" }), {
  format: "pretty", handlerArgs: { path: "a" },
});
assert.equal(responseText(formatToolResponse("search_files", text('[ { "path": "a" } ]'), "compact")), '[{"path":"a"}]');
assert.equal(responseText(formatToolResponse("list_files", text('[{"name":"src","path":"deep/src","type":"dir"},{"name":"README.md","path":"deep/README.md","type":"file"},{"name":"a","type":"file"},{"name":"b","type":"file"}]'), "compact")), "src/\nREADME.md\na\nb");

const fullSha = "0123456789abcdef0123456789abcdef01234567";
assert.equal(responseText(formatToolResponse("write_file", text(`{"path":"src/a.ts","commit_sha":"${fullSha}"}`), "compact")), `{"path":"src/a.ts","commit_sha":"${fullSha}"}`);
const source = `sha: ${fullSha}\n\nconst x = 1;\n`;
assert.equal(responseText(formatToolResponse("read_file", text(source), "compact")), source);
const diff = "--- MODIFIED: a.ts\n+line\n    ... (5 more lines truncated)";
assert.equal(responseText(formatToolResponse("get_file_diff", text(diff), "compact")), diff);
const move = "File copied to 'new.ts'.\n\nTo complete the move, delete the original here:\nhttps://github.com/o/r/blob/main/old.ts\n— click the trash icon on that page.";
const compactMove = responseText(formatToolResponse("move_file", text(move), "compact"));
assert.ok(compactMove.includes("https://github.com/o/r/blob/main/old.ts"));
assert.ok(compactMove.includes("click the trash icon"));
assert.ok(!compactMove.includes("✅"));
const issueMutation = responseText(formatToolResponse("create_issue", text('{"issue_number":7,"url":"https://example.test/i/7"}'), "compact"));
assert.equal(issueMutation, '{"issue_number":7,"url":"https://example.test/i/7"}');
const queued = responseText(formatToolResponse("queue_write", text('{"path":"a.ts","pending":1,"replaced":false}'), "compact"));
assert.equal(queued, '{"path":"a.ts","pending":1,"replaced":false}');
const issueBody = "# Issue #7: title\n\n---\n\nline one\n  indented line\n\nline three";
assert.equal(responseText(formatToolResponse("read_issue", text(issueBody), "compact")), issueBody);
const unfamiliar = "first line\n  intentional indent\nlast line";
assert.equal(responseText(formatToolResponse("unfamiliar_tool", text(unfamiliar), "compact")), unfamiliar);
const emptySearch = 'No results found for "needle" in o/r.\nNote: GitHub Code Search requires indexing.';
assert.equal(responseText(formatToolResponse("search_files", text(emptySearch), "compact")), emptySearch);
assert.equal(splitResponseFormat({ format: "invalid", path: "a" }).format, "compact");
const pretty = text("line one\nline two");
assert.strictEqual(formatToolResponse("write_file", pretty, "pretty"), pretty);
const error = text("Error: unchanged\ntext", true);
assert.strictEqual(formatToolResponse("write_file", error, "compact"), error);

const representativeResponses: Record<string, string> = {
  read_files: `[\n  {\n    "path": "a.ts",\n    "sha": "${fullSha}",\n    "content": "line one\\n  line two"\n  }\n]`,
  session_bootstrap: `{\n  "root": {\n    "items": [{"name":"IME.md","path":"IME.md","type":"file"}]\n  },\n  "files": [{"path":"IME.md","sha":"${fullSha}","content":"# IME"}]\n}`,
  push_multiple_files: `{"paths":["a.ts","b.ts"],"commit_sha":"${fullSha}"}`,
  list_files: `[{"name":"a.ts","path":"a.ts","type":"file"}]`,
  create_issue: '{"issue_number":7,"url":"https://github.test/o/r/issues/7"}',
  update_issue: '{"issue_number":7,"state":"closed","url":"https://github.test/o/r/issues/7"}',
  list_issues: `[{"number":7,"title":"Fix"}]`,
  add_issue_comment: '{"issue_number":7,"comment_url":"https://github.test/o/r/issues/7#issuecomment-1"}',
  read_issue: "# Issue #7: Fix\n\n---\n\nbody\n  indentation",
  search_files: `[{"path":"a.ts","text_matches":[{"fragment":"line one\\n  line two"}]}]`,
  move_file: `{"path":"b.ts","commit_sha":"${fullSha}","source_delete_url":"https://github.test/o/r/blob/main/a.ts"}`,
  delete_file: `{"path":"a.ts","commit_sha":"${fullSha}"}`,
  queue_write: '{"path":"a.ts","pending":1,"replaced":false}',
  flush_queue: `{"paths":["a.ts"],"commit_sha":"${fullSha}"}`,
  get_recent_commits: `[{"sha":"0123456","full_sha":"${fullSha}","message":"Fix"}]`,
  create_repo: '{"repository":"o/r","url":"https://github.test/o/r","default_branch":"main"}',
  create_branch: `{"branch":"feature","source_sha":"${fullSha}","url":"https://github.test/o/r/tree/feature"}`,
  list_branches: `[{"name":"main","sha":"${fullSha}","protected":false,"default":true}]`,
  get_file_diff: `Comparing 0123456...main\n--- MODIFIED: a.ts\n@@ -1 +1 @@\n-old\n+new`,
  get_project_board: "# Roadmap\nURL: https://github.test/orgs/o/projects/1\n\n## Todo (1)\n- Issue #7: Fix",
  move_issue_to_column: '{"issue_number":7,"project_number":1,"status":"Done"}',
  patch_multiple_files: `{\n  "files": ["a.ts"],\n  "commit_sha": "${fullSha}"\n}`,
};

assert.deepEqual(
  Object.keys(representativeResponses).sort(),
  allToolSchemas.map((schema) => schema.name).sort(),
);
for (const schema of allToolSchemas) {
  const original = text(representativeResponses[schema.name]);
  const compact = formatToolResponse(schema.name, original, "compact");
  assert.ok(responseText(compact).length > 0, `${schema.name}: compact result is non-empty`);
  assert.strictEqual(
    formatToolResponse(schema.name, original, "pretty"),
    original,
    `${schema.name}: pretty preserves the original result`,
  );
  const toolError = text(`Error from ${schema.name}\nfull detail`, true);
  assert.strictEqual(
    formatToolResponse(schema.name, toolError, "compact"),
    toolError,
    `${schema.name}: errors remain unchanged`,
  );
}

assert.ok(responseText(formatToolResponse("create_branch", text(representativeResponses.create_branch), "compact")).includes(fullSha));
assert.ok(responseText(formatToolResponse("list_branches", text(representativeResponses.list_branches), "compact")).includes(fullSha));
assert.ok(responseText(formatToolResponse("push_multiple_files", text(representativeResponses.push_multiple_files), "compact")).includes(fullSha));
assert.ok(responseText(formatToolResponse("delete_file", text(representativeResponses.delete_file), "compact")).includes(fullSha));
assert.ok(responseText(formatToolResponse("flush_queue", text(representativeResponses.flush_queue), "compact")).includes(fullSha));
assert.ok(responseText(formatToolResponse("create_repo", text(representativeResponses.create_repo), "compact")).includes("https://github.test/o/r"));
assert.ok(responseText(formatToolResponse("move_issue_to_column", text(representativeResponses.move_issue_to_column), "compact")).includes('"status":"Done"'));
const binaryRead = `sha: ${fullSha}\nmime_type: image/png\nsize_bytes: 4\ncontent_encoding: base64\n\nAAEC`;
assert.equal(responseText(formatToolResponse("read_file", text(binaryRead), "compact")), binaryRead);
assert.equal(
  responseText(formatToolResponse("read_files", text(representativeResponses.read_files), "compact")),
  `[{"path":"a.ts","sha":"${fullSha}","content":"line one\\n  line two"}]`,
);

console.log(`response-format tests passed for ${allToolSchemas.length} registered tools`);
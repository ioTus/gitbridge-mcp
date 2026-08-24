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

assert.equal(allToolSchemas.length, 21);
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
assert.equal(responseText(formatToolResponse("write_file", text(`✅ Writing to: o/r\nFile 'src/a.ts' updated successfully.\nCommit SHA: ${fullSha}\nBranch: main`), "compact")), `src/a.ts ${fullSha}`);
const source = `sha: ${fullSha}\n\nconst x = 1;\n`;
assert.equal(responseText(formatToolResponse("read_file", text(source), "compact")), source);
const diff = "--- MODIFIED: a.ts\n+line\n    ... (5 more lines truncated)";
assert.equal(responseText(formatToolResponse("get_file_diff", text(diff), "compact")), diff);
const move = "File copied to 'new.ts'.\n\nTo complete the move, delete the original here:\nhttps://github.com/o/r/blob/main/old.ts\n— click the trash icon on that page.";
const compactMove = responseText(formatToolResponse("move_file", text(move), "compact"));
assert.ok(compactMove.includes("https://github.com/o/r/blob/main/old.ts"));
assert.ok(compactMove.includes("click the trash icon"));
assert.ok(!compactMove.includes("✅"));
const issueMutation = responseText(formatToolResponse("create_issue", text("✅ Writing to: o/r\nIssue created successfully.\nNumber: #7\nTitle: A title\nURL: https://example.test/i/7"), "compact"));
assert.equal(issueMutation, "Number: #7; Title: A title; URL: https://example.test/i/7");
assert.ok(!issueMutation.includes("✅ Writing to"));
const queued = responseText(formatToolResponse("queue_write", text("✅ Writing to: o/r\nQueued ✓ — 1 write pending for o/r (branch: main).\nCall flush_queue to commit.\n⚠️ Note: queue resets if the server restarts."), "compact"));
assert.ok(!queued.includes("✅"));
assert.ok(queued.includes("queue resets if the server restarts"));
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
  push_multiple_files: `✅ Writing to: o/r\nSuccessfully pushed 2 files in a single commit.\nFiles: a.ts, b.ts\nCommit SHA: ${fullSha}\nBranch: main`,
  list_files: `[{"name":"a.ts","path":"a.ts","type":"file"}]`,
  create_issue: "✅ Writing to: o/r\nIssue created successfully.\nNumber: #7\nTitle: Fix\nURL: https://github.test/o/r/issues/7",
  update_issue: "✅ Writing to: o/r\nIssue #7 updated successfully.\nTitle: Fix\nState: closed\nURL: https://github.test/o/r/issues/7",
  list_issues: `[{"number":7,"title":"Fix"}]`,
  add_issue_comment: "✅ Writing to: o/r\nComment added to issue #7.\nComment URL: https://github.test/o/r/issues/7#issuecomment-1",
  read_issue: "# Issue #7: Fix\n\n---\n\nbody\n  indentation",
  search_files: `[{"path":"a.ts","text_matches":[{"fragment":"line one\\n  line two"}]}]`,
  move_file: `✅ Writing to: o/r\nFile copied to 'b.ts'.\nCommit SHA: ${fullSha}\nBranch: main\n\nTo complete the move, delete the original here:\nhttps://github.test/o/r/blob/main/a.ts\n— click the trash icon on that page.`,
  delete_file: `✅ Writing to: o/r\nFile 'a.ts' deleted successfully.\nCommit SHA: ${fullSha}\nBranch: main`,
  queue_write: "✅ Writing to: o/r\nQueued ✓ — 1 write pending for o/r (branch: main).\nCall flush_queue to commit.\n⚠️ Note: queue resets if the server restarts.",
  flush_queue: `✅ Writing to: o/r\nSuccessfully committed 1 file in a single commit.\nFiles: a.ts\nCommit SHA: ${fullSha}\nBranch: main`,
  get_recent_commits: `[{"sha":"0123456","full_sha":"${fullSha}","message":"Fix"}]`,
  create_repo: "✅ Writing to: o/r\nRepository created successfully.\nFull name: o/r\nURL: https://github.test/o/r\nClone URL: https://github.test/o/r.git\nDefault branch: main\nVisibility: private",
  create_branch: `✅ Writing to: o/r\nBranch created: feature\nRepository: o/r\nSource: main (${fullSha})\nURL: https://github.test/o/r/tree/feature`,
  list_branches: `[{"name":"main","sha":"${fullSha}","protected":false,"default":true}]`,
  get_file_diff: `Comparing 0123456...main\n--- MODIFIED: a.ts\n@@ -1 +1 @@\n-old\n+new`,
  get_project_board: "# Roadmap\nURL: https://github.test/orgs/o/projects/1\n\n## Todo (1)\n- Issue #7: Fix",
  move_issue_to_column: '✅ Moved issue #7 to "Done" on project #1',
  patch_multiple_files: `✅ Writing to: o/r\n{\n  "files": ["a.ts"],\n  "commit_sha": "${fullSha}"\n}`,
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
assert.ok(responseText(formatToolResponse("move_issue_to_column", text(representativeResponses.move_issue_to_column), "compact")).includes('issue #7 to "Done"'));
const binaryRead = `sha: ${fullSha}\nmime_type: image/png\nsize_bytes: 4\ncontent_encoding: base64\n\nAAEC`;
assert.equal(responseText(formatToolResponse("read_file", text(binaryRead), "compact")), binaryRead);
assert.equal(
  responseText(formatToolResponse("read_files", text(representativeResponses.read_files), "compact")),
  `[{"path":"a.ts","sha":"${fullSha}","content":"line one\\n  line two"}]`,
);

console.log(`response-format tests passed for ${allToolSchemas.length} registered tools`);
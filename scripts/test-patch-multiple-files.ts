import assert from "node:assert/strict";
import { applyOperations } from "../server/tools/patch_multiple_files.js";

type Operation = Parameters<typeof applyOperations>[1][number];

function apply(originalContent: string, operations: Operation[]) {
  const result = applyOperations(originalContent, operations, "test.txt");
  if ("error" in result) throw new Error(result.error);
  return result;
}

// A match that includes the trailing newline of the final line still ends at
// EOF, so insert_after must not add another newline of its own.
const trailingNewline = apply("first\nlast\n", [
  { type: "insert_after", match: "last\n", content: "next" },
]);
assert.equal(trailingNewline.content, "first\nlast\nnext");
assert.deepEqual(trailingNewline.summary, [
  { type: "insert_after", line: 2, lines_added: 0 },
]);

// A two-line list match must split immediately after the matched newline,
// rather than moving the insertion to the end of the following line.
const list = apply("- one\n- two\n", [
  { type: "insert_after", match: "- one\n", content: "- inserted\n" },
]);
assert.equal(list.content, "- one\n- inserted\n- two\n");
assert.equal(list.summary[0].lines_added, 1);

// Markdown rows are inserted exactly at the matched row boundary.
const table = apply("| name | value |\n| --- | --- |\n| one | 1 |\n", [
  {
    type: "insert_after",
    match: "| one | 1 |\n",
    content: "| two | 2 |\n",
  },
]);
assert.equal(
  table.content,
  "| name | value |\n| --- | --- |\n| one | 1 |\n| two | 2 |\n",
);

// Before and after are symmetric exact-boundary operations, including in the
// middle of a line where no implicit newline should appear.
const before = apply("leftTARGETright", [
  { type: "insert_before", match: "TARGET", content: "<" },
]);
assert.equal(before.content, "left<TARGETright");
assert.equal(before.summary[0].lines_added, 0);

const after = apply("leftTARGETright", [
  { type: "insert_after", match: "TARGET", content: ">" },
]);
assert.equal(after.content, "leftTARGET>right");
assert.equal(after.summary[0].lines_added, 0);

// CRLF, Unicode, and insertion text are preserved byte-for-byte as strings.
const crlfUnicode = apply("α\r\nβ\r\n", [
  { type: "insert_after", match: "α\r\n", content: "😀\r\n" },
  { type: "insert_before", match: "β", content: "λ" },
]);
assert.equal(crlfUnicode.content, "α\r\n😀\r\nλβ\r\n");
assert.deepEqual(crlfUnicode.summary, [
  { type: "insert_after", line: 1, lines_added: 1 },
  { type: "insert_before", line: 3, lines_added: 0 },
]);

// lines_added counts only literal LF characters, including LF characters in
// CRLF input, and not logical lines or bare carriage returns.
const lineCounts = apply("a\nb\nc", [
  { type: "insert_after", match: "a\n", content: "x\r\ny\n" },
  { type: "insert_before", match: "c", content: "z\r" },
]);
assert.deepEqual(lineCounts.summary, [
  { type: "insert_after", line: 1, lines_added: 2 },
  { type: "insert_before", line: 5, lines_added: 0 },
]);

// Operations remain ordered and each operation searches the content produced
// by the previous one.
const sequential = apply("one\ntwo\n", [
  { type: "replace", old: "one", new: "ONE" },
  { type: "insert_after", match: "ONE", content: "!" },
  { type: "insert_before", match: "two", content: "?" },
]);
assert.equal(sequential.content, "ONE!\n?two\n");
assert.deepEqual(sequential.summary, [
  { type: "replace", line: 1, preview: "ONE" },
  { type: "insert_after", line: 1, lines_added: 0 },
  { type: "insert_before", line: 2, lines_added: 0 },
]);

// Existing replace and whole-line delete behavior remains unchanged.
const replace = apply("keep\nold\nkeep\n", [
  { type: "replace", old: "old", new: "new" },
]);
assert.equal(replace.content, "keep\nnew\nkeep\n");

const deletion = apply("keep\nremove\nkeep\n", [
  { type: "delete", match: "remove" },
]);
assert.equal(deletion.content, "keep\nkeep\n");
assert.deepEqual(deletion.summary, [
  { type: "delete", line: 2, lines_removed: 1 },
]);

console.log("patch_multiple_files tests passed");
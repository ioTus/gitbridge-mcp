import assert from "node:assert/strict";
import { allToolSchemas } from "../server/tools/registry.js";
import {
  dispatchMissingTool,
  missingToolResult,
  retiredToolError,
  retiredToolErrors,
} from "../server/tools/retired.js";

const expected = {
  read_file:
    'read_file is retired — use read_files with paths: ["<path>"]',
  patch_file:
    "patch_file is retired — use patch_multiple_files with files: [{path, operations}]",
  write_file:
    "write_file is retired — use push_multiple_files with files: [{path, content}]",
  check_file_status:
    "check_file_status is retired — use read_files with metadata_only: true",
};

assert.deepEqual(retiredToolErrors, expected);
assert.equal(allToolSchemas.length, 22);
for (const [name, message] of Object.entries(expected)) {
  assert.equal(
    allToolSchemas.some((schema) => schema.name === name),
    false,
  );
  assert.equal(retiredToolError(name), message);
  assert.deepEqual(missingToolResult(name), {
    content: [{ type: "text", text: message }],
    isError: true,
  });
  let activity: Record<string, unknown> | undefined;
  const dispatched = dispatchMissingTool(
    name,
    { owner: "private-owner", content: "private-content" },
    { session: "session-1", request_id: "request-1" },
    (value) => {
      activity = value;
    },
  );
  assert.deepEqual(dispatched, missingToolResult(name));
  assert.deepEqual(activity, {
    tool: name,
    args: { owner: "private-owner", content: "private-content" },
    outcome: "error",
    duration_ms: 0,
    error_class: "validation",
    session: "session-1",
    request_id: "request-1",
  });
}
assert.equal(retiredToolError("unknown"), undefined);
assert.deepEqual(missingToolResult("unknown"), {
  content: [{ type: "text", text: "Unknown tool: unknown" }],
  isError: true,
});

console.log("retired-tool compatibility tests passed");
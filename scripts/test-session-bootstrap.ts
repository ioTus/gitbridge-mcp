import assert from "node:assert/strict";
import {
  SESSION_BOOTSTRAP_MAX_EXTRAS,
  sessionBootstrap,
  sessionBootstrapSchema,
} from "../server/tools/session_bootstrap.js";
import {
  READ_FILES_MAX_DECODED_BYTES,
  readFiles,
} from "../server/tools/read_files.js";

const sha = (value: string) => value.repeat(40).slice(0, 40);
const result = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});
const parse = (response: any) => JSON.parse(response.content[0].text);

assert.equal(
  sessionBootstrapSchema.inputSchema.properties.extras.maxItems,
  19,
);
assert.match(
  sessionBootstrapSchema.description,
  /not IME-initialized; stop/i,
);

const calls: Array<{ kind: string; args: any }> = [];
const accepted = await sessionBootstrap(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    extras: ["project/_config.md"],
  },
  {
    list: async (args) => {
      calls.push({ kind: "list", args });
      return result([
        { name: "IME.md", path: "IME.md", type: "file" },
        { name: "server", path: "server", type: "dir" },
      ]);
    },
    read: async (args) => {
      calls.push({ kind: "read", args });
      return result([
        { path: "IME.md", sha: sha("i"), content: "# IME" },
        {
          path: "project/_config.md",
          sha: sha("c"),
          content: "# Config",
        },
      ]);
    },
  },
);
assert.deepEqual(parse(accepted), {
  root: {
    items: [
      { name: "IME.md", path: "IME.md", type: "file" },
      { name: "server", path: "server", type: "dir" },
    ],
  },
  files: [
    { path: "IME.md", sha: sha("i"), content: "# IME" },
    {
      path: "project/_config.md",
      sha: sha("c"),
      content: "# Config",
    },
  ],
});
assert.deepEqual(calls, [
  {
    kind: "list",
    args: {
      owner: "ioTus",
      repo: "gitbridge-mcp",
      path: "",
      branch: "main",
    },
  },
  {
    kind: "read",
    args: {
      owner: "ioTus",
      repo: "gitbridge-mcp",
      paths: ["IME.md", "project/_config.md"],
      branch: "main",
    },
  },
]);

const missing = await sessionBootstrap(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    extras: ["missing.md"],
  },
  {
    list: async () => ({
      content: [{ type: "text", text: "Error: GitHub unavailable" }],
      isError: true,
    }),
    read: async () =>
      result([
        { path: "IME.md", error: "not_found" },
        { path: "missing.md", error: "not_found" },
      ]),
  },
);
assert.deepEqual(parse(missing), {
  root: { error: "GitHub unavailable" },
  files: [
    { path: "IME.md", error: "not_found" },
    { path: "missing.md", error: "not_found" },
  ],
});
assert.equal(missing.isError, undefined);

const first = Buffer.alloc(200 * 1024, 1);
const skipped = Buffer.alloc(100 * 1024, 2);
const later = Buffer.alloc(50 * 1024, 3);
const partial = await sessionBootstrap(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    extras: ["skipped.bin", "later.bin"],
  },
  {
    list: async () => result([]),
    read: async (args) =>
      readFiles(
        args,
        (async ({ path }: any) => {
          const content =
            path === "IME.md"
              ? first
              : path === "skipped.bin"
                ? skipped
                : later;
          return {
            data: {
              type: "file",
              path,
              sha: sha(path),
              size: content.byteLength,
              content: content.toString("base64"),
              encoding: "base64",
            },
          } as any;
        }) as any,
      ),
  },
);
const partialFiles = parse(partial).files;
assert.equal(partialFiles[0].content.length, first.byteLength);
assert.equal(partialFiles[1].error, "aggregate_limit");
assert.equal(partialFiles[1].size_bytes, skipped.byteLength);
assert.equal(partialFiles[2].content.length, later.byteLength);
assert.equal(
  first.byteLength + later.byteLength <= READ_FILES_MAX_DECODED_BYTES,
  true,
);

for (const args of [
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    extras: Array.from(
      { length: SESSION_BOOTSTRAP_MAX_EXTRAS + 1 },
      (_, index) => `${index}.md`,
    ),
  },
  { owner: "ioTus", repo: "gitbridge-mcp", extras: [""] },
  { owner: "ioTus", repo: "gitbridge-mcp", extras: "config.md" },
  { owner: "ioTus", repo: "gitbridge-mcp", branch: "" },
  { owner: 123, repo: "gitbridge-mcp" },
  { owner: "ioTus", repo: {} },
]) {
  const invalid = await sessionBootstrap(args);
  assert.equal(invalid.isError, true);
}

console.log("session_bootstrap tests passed");
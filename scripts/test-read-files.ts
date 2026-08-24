import assert from "node:assert/strict";
import {
  readFiles,
  readFilesSchema,
  READ_FILES_MAX_DECODED_BYTES,
} from "../server/tools/read_files.js";

const sha = (value: string) => value.repeat(40).slice(0, 40);
const fileResponse = (path: string, content: Buffer, id = path) =>
  ({
    data: {
      type: "file",
      path,
      sha: sha(id),
      size: content.byteLength,
      content: content.toString("base64"),
      encoding: "base64",
    },
  }) as any;
const parse = (result: any) => JSON.parse(result.content[0].text);

assert.equal(readFilesSchema.inputSchema.properties.paths.minItems, 1);
assert.equal(readFilesSchema.inputSchema.properties.paths.maxItems, 20);
assert.equal(
  readFilesSchema.inputSchema.properties.metadata_only.default,
  false,
);

const contentByPath = new Map([
  ["IME.md", Buffer.from("# IME")],
  ["framework/maintenance.md", Buffer.from("# Maintenance")],
  ["roles/developer.md", Buffer.from("# Developer")],
]);
const accepted = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: [...contentByPath.keys()],
  },
  (async ({ path }: any) =>
    fileResponse(path, contentByPath.get(path)!)) as any,
);
const acceptedFiles = parse(accepted);
assert.deepEqual(
  acceptedFiles.map((file: any) => file.path),
  [...contentByPath.keys()],
);
assert.ok(acceptedFiles.every((file: any) => file.sha && file.content));

const bestEffort = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a.txt", "missing.txt", "b.txt"],
  },
  (async ({ path }: any) => {
    if (path === "missing.txt") throw Object.assign(new Error("missing"), { status: 404 });
    return fileResponse(path, Buffer.from(path));
  }) as any,
);
assert.deepEqual(parse(bestEffort), [
  { path: "a.txt", sha: sha("a.txt"), content: "a.txt" },
  { path: "missing.txt", error: "not_found" },
  { path: "b.txt", sha: sha("b.txt"), content: "b.txt" },
]);
assert.equal(bestEffort.isError, undefined);

const first = Buffer.alloc(200 * 1024, 1);
const tooLargeForRemainder = Buffer.alloc(100 * 1024, 2);
const laterSmallFile = Buffer.alloc(50 * 1024, 3);
const partial = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["first.bin", "skipped.bin", "later.bin"],
    content_encoding: "base64",
  },
  (async ({ path }: any) => {
    const contents: Record<string, Buffer> = {
      "first.bin": first,
      "skipped.bin": tooLargeForRemainder,
      "later.bin": laterSmallFile,
    };
    return fileResponse(path, contents[path]);
  }) as any,
);
const partialFiles = parse(partial);
assert.equal(partialFiles[0].size_bytes, 200 * 1024);
assert.equal(partialFiles[1].error, "aggregate_limit");
assert.equal(partialFiles[1].sha, sha("skipped.bin"));
assert.equal(partialFiles[1].size_bytes, 100 * 1024);
assert.equal(partialFiles[1].content, undefined);
assert.equal(partialFiles[2].size_bytes, 50 * 1024);
assert.ok(partialFiles[2].content);
assert.equal(first.byteLength + laterSmallFile.byteLength <= READ_FILES_MAX_DECODED_BYTES, true);

const directory = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["src", "failure.txt"],
  },
  (async ({ path }: any) => {
    if (path === "src") return { data: [] } as any;
    throw Object.assign(new Error("rate limited"), { status: 429 });
  }) as any,
);
assert.deepEqual(parse(directory), [
  { path: "src", error: "directory" },
  { path: "failure.txt", error: "github_api" },
]);

const unavailableLarge = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["large.dat", "unavailable.txt"],
  },
  (async ({ path }: any) => ({
    data: {
      type: "file",
      path,
      sha: sha(path),
      size:
        path === "large.dat"
          ? READ_FILES_MAX_DECODED_BYTES + 1
          : 10,
      content: "",
      encoding: "none",
    },
  })) as any,
);
assert.deepEqual(parse(unavailableLarge), [
  {
    path: "large.dat",
    sha: sha("large.dat"),
    size_bytes: READ_FILES_MAX_DECODED_BYTES + 1,
    error: "aggregate_limit",
  },
  {
    path: "unavailable.txt",
    sha: sha("unavailable.txt"),
    size_bytes: 10,
    error: "content_unavailable",
  },
]);

const metadataPaths = Array.from(
  { length: 20 },
  (_, index) => `large-${index}.bin`,
);
const metadataOnly = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: metadataPaths,
    metadata_only: true,
  },
  (async ({ path }: any) => ({
    data: {
      type: "file",
      path,
      sha: sha(path),
      size: READ_FILES_MAX_DECODED_BYTES,
      content: "",
      encoding: "none",
    },
  })) as any,
);
assert.deepEqual(
  parse(metadataOnly),
  metadataPaths.map((path) => ({
    path,
    sha: sha(path),
    size_bytes: READ_FILES_MAX_DECODED_BYTES,
  })),
);
assert.ok(
  parse(metadataOnly).every(
    (file: any) =>
      file.content === undefined && file.error === undefined,
  ),
);

for (const args of [
  { owner: "ioTus", repo: "gitbridge-mcp", paths: [] },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: Array.from({ length: 21 }, (_, index) => `${index}.txt`),
  },
  { owner: "ioTus", repo: "gitbridge-mcp", paths: [""] },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    content_encoding: "invalid",
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    metadata_only: "yes",
  },
]) {
  const invalid = await readFiles(args);
  assert.equal(invalid.isError, true);
}

console.log("read_files tests passed");
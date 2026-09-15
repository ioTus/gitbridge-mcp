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
const blobResponse = (content: Buffer) =>
  ({
    data: {
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
assert.equal(readFilesSchema.inputSchema.properties.offset_bytes.default, 0);
assert.equal(readFilesSchema.inputSchema.properties.offset_bytes.minimum, 0);
assert.equal(readFilesSchema.inputSchema.properties.max_bytes.minimum, 1);

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
    error: "file_too_large",
    message: "File exceeds the 262144-byte decoded-content limit; use offset_bytes and max_bytes to read it in ranges.",
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

const rangedSource = Buffer.alloc(471_917);
for (let index = 0; index < rangedSource.length; index += 1) {
  rangedSource[index] = index % 251;
}
let rangedContentCalls = 0;
let rangedBlobCalls = 0;
const ranged = await readFiles(
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["large.bin"],
    content_encoding: "base64",
    max_bytes: rangedSource.length,
  },
  (async () => {
    rangedContentCalls += 1;
    return fileResponse("large.bin", rangedSource);
  }) as any,
  (async ({ file_sha }: any) => {
    rangedBlobCalls += 1;
    assert.equal(file_sha, sha("large.bin"));
    return blobResponse(rangedSource);
  }) as any,
);
const rangedFile = parse(ranged)[0];
assert.equal(rangedContentCalls, 1);
assert.equal(rangedBlobCalls, 1);
assert.equal(rangedFile.size_bytes, rangedSource.length);
assert.equal(rangedFile.offset_bytes, 0);
assert.equal(rangedFile.returned_bytes, READ_FILES_MAX_DECODED_BYTES);
assert.equal(rangedFile.has_more, true);
assert.deepEqual(
  Buffer.from(rangedFile.content, "base64"),
  rangedSource.subarray(0, READ_FILES_MAX_DECODED_BYTES),
);

const fiveMegabytes = Buffer.alloc(5 * 1024 * 1024);
for (let index = 0; index < fiveMegabytes.length; index += 1) {
  fiveMegabytes[index] = (index * 17) % 256;
}
const base64Chunks: Buffer[] = [];
let base64Offset = 0;
for (;;) {
  const chunkResult = await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge-mcp",
      paths: ["five-megabytes.bin"],
      content_encoding: "base64",
      offset_bytes: base64Offset,
      max_bytes: 5 * 1024 * 1024,
    },
    (async () => fileResponse("five-megabytes.bin", fiveMegabytes)) as any,
    (async () => blobResponse(fiveMegabytes)) as any,
  );
  const chunk = parse(chunkResult)[0];
  assert.equal(chunk.size_bytes, fiveMegabytes.length);
  assert.equal(chunk.offset_bytes, base64Offset);
  assert.equal(chunk.returned_bytes, Math.min(
    READ_FILES_MAX_DECODED_BYTES,
    fiveMegabytes.length - base64Offset,
  ));
  assert.deepEqual(
    Buffer.from(chunk.content, "base64"),
    fiveMegabytes.subarray(
      base64Offset,
      base64Offset + chunk.returned_bytes,
    ),
  );
  base64Chunks.push(Buffer.from(chunk.content, "base64"));
  if (!chunk.has_more) break;
  assert.ok(chunk.returned_bytes > 0);
  base64Offset = chunk.offset_bytes + chunk.returned_bytes;
}
assert.deepEqual(Buffer.concat(base64Chunks), fiveMegabytes);

const utf8Source = Buffer.from("ab😀x—tail ".repeat(400));
let utf8Offset = 0;
const utf8Chunks: Buffer[] = [];
for (;;) {
  const chunkResult = await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge-mcp",
      paths: ["unicode.txt"],
      offset_bytes: utf8Offset,
      max_bytes: 17,
    },
    (async () => fileResponse("unicode.txt", utf8Source)) as any,
    (async () => blobResponse(utf8Source)) as any,
  );
  const chunk = parse(chunkResult)[0];
  assert.ok(chunk.returned_bytes > 0);
  assert.equal(chunk.offset_bytes, utf8Offset);
  utf8Chunks.push(Buffer.from(chunk.content, "utf8"));
  if (!chunk.has_more) break;
  utf8Offset = chunk.offset_bytes + chunk.returned_bytes;
}
assert.deepEqual(Buffer.concat(utf8Chunks), utf8Source);

const snappedStart = parse(
  await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge",
      paths: ["unicode.txt"],
      offset_bytes: 3,
      max_bytes: 4,
    },
    (async () => fileResponse("unicode.txt", Buffer.from("a😀z"))) as any,
    (async () => blobResponse(Buffer.from("a😀z"))) as any,
  ),
)[0];
assert.equal(snappedStart.offset_bytes, 1);
assert.equal(snappedStart.returned_bytes, 4);
assert.equal(snappedStart.content, "😀");

const snappedEnd = parse(
  await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge",
      paths: ["unicode.txt"],
      max_bytes: 4,
    },
    (async () => fileResponse("unicode.txt", Buffer.from("ab😀x"))) as any,
    (async () => blobResponse(Buffer.from("ab😀x"))) as any,
  ),
)[0];
assert.equal(snappedEnd.offset_bytes, 0);
assert.equal(snappedEnd.returned_bytes, 2);
assert.equal(snappedEnd.content, "ab");
assert.equal(snappedEnd.has_more, true);

const tooSmallForCharacter = parse(
  await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge",
      paths: ["unicode.txt"],
      max_bytes: 1,
    },
    (async () => fileResponse("unicode.txt", Buffer.from("😀"))) as any,
    (async () => blobResponse(Buffer.from("😀"))) as any,
  ),
)[0];
assert.equal(tooSmallForCharacter.error, "max_bytes_too_small");
assert.match(tooSmallForCharacter.message, /max_bytes/);
assert.equal(tooSmallForCharacter.returned_bytes, 0);
assert.equal(tooSmallForCharacter.has_more, undefined);

const missingBlobContent = parse(
  await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge",
      paths: ["missing-content.txt"],
      offset_bytes: 0,
    },
    (async () => fileResponse("missing-content.txt", Buffer.from("text"))) as any,
    (async () => ({ data: { encoding: "none" } })) as any,
  ),
)[0];
assert.deepEqual(missingBlobContent, {
  path: "missing-content.txt",
  sha: sha("missing-content.txt"),
  size_bytes: 4,
  error: "content_unavailable",
});

const failedBlob = parse(
  await readFiles(
    {
      owner: "ioTus",
      repo: "gitbridge",
      paths: ["failed-blob.txt"],
      max_bytes: 1,
    },
    (async () => fileResponse("failed-blob.txt", Buffer.from("text"))) as any,
    (async () => {
      throw Object.assign(new Error("blob failure"), { status: 500 });
    }) as any,
  ),
)[0];
assert.deepEqual(failedBlob, {
  path: "failed-blob.txt",
  sha: sha("failed-blob.txt"),
  size_bytes: 4,
  error: "github_api",
});

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
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    offset_bytes: -1,
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    offset_bytes: 1.5,
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    offset_bytes: Number.MAX_SAFE_INTEGER + 1,
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    max_bytes: 0,
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    max_bytes: 1.5,
  },
  {
    owner: "ioTus",
    repo: "gitbridge-mcp",
    paths: ["a"],
    max_bytes: Number.MAX_SAFE_INTEGER + 1,
  },
]) {
  const invalid = await readFiles(args);
  assert.equal(invalid.isError, true);
}

assert.equal(
  (
    await readFiles(
      {
        owner: "ioTus",
        repo: "gitbridge-mcp",
        paths: ["a", "b"],
        offset_bytes: 0,
      },
      (async ({ path }: any) => fileResponse(path, Buffer.from(path))) as any,
      (async ({ file_sha }: any) => blobResponse(Buffer.from(file_sha))) as any,
    )
  ).isError,
  true,
);
assert.equal(
  (
    await readFiles(
      {
        owner: "ioTus",
        repo: "gitbridge-mcp",
        paths: ["a"],
        max_bytes: 1,
        metadata_only: true,
      },
      (async ({ path }: any) => fileResponse(path, Buffer.from(path))) as any,
      (async ({ file_sha }: any) => blobResponse(Buffer.from(file_sha))) as any,
    )
  ).isError,
  true,
);

console.log("read_files tests passed");
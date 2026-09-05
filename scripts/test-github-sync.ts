import assert from "node:assert/strict";
import {
  GitHubApiError,
  SYNC_UTILITY_VERSION,
  assertRepoRoot,
  loadManifest,
} from "./github-sync.ts";

const config = { owner: "ioTus", repo: "gitbridge-mcp", branch: "main" };

async function testManifestLoading(): Promise<void> {
  const firstRun = await loadManifest("", config, "main", async () => {
    throw new GitHubApiError("not found", 404);
  });
  assert.deepEqual(firstRun, { pushedPaths: [] });

  await assert.rejects(
    loadManifest("", config, "main", async () => {
      throw new GitHubApiError("server failure", 500);
    }),
    /sync aborted without pushing.*server failure/,
  );

  await assert.rejects(
    loadManifest("", config, "main", async () => ({
      content: Buffer.from("{broken").toString("base64"),
    })),
    /Invalid \.replit-sync-manifest\.json.*sync aborted without pushing/,
  );

  await assert.rejects(
    loadManifest("", config, "main", async () => ({
      content: Buffer.from(JSON.stringify({ pushedPaths: "wrong" })).toString(
        "base64",
      ),
    })),
    /'pushedPaths' must be an array/,
  );

  const valid = await loadManifest("", config, "main", async () => ({
    content: Buffer.from(
      JSON.stringify({ pushedPaths: ["scripts/github-sync.ts"] }),
    ).toString("base64"),
  }));
  assert.deepEqual(valid, { pushedPaths: ["scripts/github-sync.ts"] });
}

function testRepoRoot(): void {
  assert.doesNotThrow(() => assertRepoRoot());

  const originalCwd = process.cwd();
  try {
    process.chdir("scripts");
    assert.throws(
      () => assertRepoRoot(),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("Working directory:") &&
        err.message.includes("Git repository root:"),
    );
  } finally {
    process.chdir(originalCwd);
  }
}

async function main(): Promise<void> {
  assert.equal(SYNC_UTILITY_VERSION, "2.1.1");
  await testManifestLoading();
  testRepoRoot();
  console.log("github-sync v2.1.1 tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
/**
 * IME GitHub Sync Utility
 *
 * Replit cannot `git push` — the platform blocks outbound git protocol
 * traffic. This utility replaces all git push/pull operations with
 * GitHub Git Data API calls.
 *
 * ---------------------------------------------------------------------
 * SYNC_UTILITY_VERSION: 2.1.0
 *
 * Lineage:
 *   1.0.0  ioTus/gitbridge-mcp — original. Additions only, no deletion
 *          tracking. Still the version at the canonical source path as
 *          of 2026-08-19.
 *   2.0.0  ioTus/trackback (April 2026, trackback#3) — manifest-based
 *          deletion tracking. Never backported to canonical; shipped
 *          unstamped.
 *   2.1.0  ioTus/eatezy (2026-08-19) — version stamping, explicit
 *          repo-root invariant, bulk-deletion sanity check, and error
 *          paths that report the files they failed on.
 *
 * Backport of 2.1.0 to the canonical source is tracked on
 * ioTus/gitbridge-mcp. Do not fork this file further without recording
 * the change there.
 * ---------------------------------------------------------------------
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export const SYNC_UTILITY_VERSION = "2.1.0";

const MANIFEST_PATH = ".replit-sync-manifest.json";
const CONFIG_PATH = "ime.config.json";

/**
 * Below this many tracked paths, "everything is missing" is plausibly a
 * real deletion. At or above it, it is far more likely the process is
 * running somewhere unexpected. See assertNotBulkDeletion().
 */
const BULK_DELETE_THRESHOLD = 5;

interface IMEConfig {
  owner: string;
  repo: string;
  branch?: string;
}

interface Manifest {
  pushedPaths: string[];
}

interface SyncResult {
  success: boolean;
  sha?: string;
  filesChanged: string[];
  filesDeleted: string[];
  upstreamWarnings: string[];
  error?: string;
}

/**
 * The deletion logic resolves every manifest path against process.cwd().
 * If cwd is not the repository root, every tracked path reads as missing
 * and the sync would delete everything Replit owns.
 *
 * loadConfig() already fails in that situation, because ime.config.json
 * only exists at the root. That protection is incidental, though — a
 * future change making config lookup search parent directories would
 * silently remove it. This states the invariant directly so it survives
 * refactors of unrelated code.
 */
function assertRepoRoot(): void {
  if (!existsSync(resolve(process.cwd(), CONFIG_PATH))) {
    throw new Error(
      `${CONFIG_PATH} not found in ${process.cwd()}.\n` +
        `Run this utility from the repository root — deletion detection ` +
        `resolves manifest paths against the current working directory, ` +
        `so running elsewhere is unsafe.`,
    );
  }
}

function loadConfig(): IMEConfig {
  const configPath = resolve(process.cwd(), CONFIG_PATH);
  if (!existsSync(configPath)) {
    throw new Error(
      `${CONFIG_PATH} not found in project root. Create it with { "owner": "...", "repo": "..." }`,
    );
  }
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  if (!config.owner || !config.repo) {
    throw new Error(
      `${CONFIG_PATH} must contain 'owner' and 'repo' fields`,
    );
  }
  return config;
}

async function githubApi(
  token: string,
  endpoint: string,
  options: { method?: string; body?: any } = {},
): Promise<any> {
  const resp = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `GitHub API ${resp.status}: ${data.message || JSON.stringify(data)} (${endpoint})`,
    );
  }
  return data;
}

async function getToken(): Promise<string> {
  try {
    const { ReplitConnectors } = await import("@replit/connectors-sdk");
    const connectors = new ReplitConnectors();
    const resp = await connectors.proxy("github", "/user", { method: "GET" });
    if (resp.ok) {
      return `__connectors_proxy__`;
    }
  } catch {}

  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (pat) return pat;

  throw new Error(
    "No GitHub authentication available. Install the Replit GitHub integration or set GITHUB_PERSONAL_ACCESS_TOKEN.",
  );
}

async function githubApiWithConnectors(
  endpoint: string,
  options: { method?: string; body?: any } = {},
): Promise<any> {
  const { ReplitConnectors } = await import("@replit/connectors-sdk");
  const connectors = new ReplitConnectors();
  const resp = await connectors.proxy("github", endpoint, {
    method: options.method || "GET",
    ...(options.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
  const data = await resp.json();
  if (data.message && !data.sha && !data.login) {
    throw new Error(`GitHub API error: ${data.message} (${endpoint})`);
  }
  return data;
}

let useConnectorsProxy = false;

async function api(
  token: string,
  endpoint: string,
  options: { method?: string; body?: any } = {},
): Promise<any> {
  if (useConnectorsProxy) {
    return githubApiWithConnectors(endpoint, options);
  }
  return githubApi(token, endpoint, options);
}

async function loadManifest(
  token: string,
  config: IMEConfig,
  branch: string,
): Promise<Manifest> {
  try {
    const data = await api(
      token,
      `/repos/${config.owner}/${config.repo}/contents/${MANIFEST_PATH}?ref=${branch}`,
    );
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.pushedPaths)) {
      return parsed as Manifest;
    }
  } catch {}
  return { pushedPaths: [] };
}

/**
 * Guards the one catastrophic failure mode: a run in which every tracked
 * path reads as missing, producing a commit that deletes the entire
 * Replit-owned tree. Below BULK_DELETE_THRESHOLD this is a plausible
 * real deletion and is allowed through.
 */
function assertNotBulkDeletion(tracked: string[], missing: string[]): void {
  if (
    tracked.length >= BULK_DELETE_THRESHOLD &&
    missing.length === tracked.length
  ) {
    throw new Error(
      `Refusing to sync: all ${tracked.length} manifest-tracked paths appear ` +
        `missing from ${process.cwd()}.\n` +
        `This is the signature of a misconfigured working directory, not a ` +
        `real bulk deletion. Nothing was pushed.\n` +
        `If this genuinely is a full deletion, clear ${MANIFEST_PATH} manually and re-run.`,
    );
  }
}

function getDeletedFiles(manifest: Manifest): string[] {
  const tracked = manifest.pushedPaths.filter((p) => p !== MANIFEST_PATH);
  if (tracked.length === 0) return [];

  const missing = tracked.filter(
    (filePath) => !existsSync(resolve(process.cwd(), filePath)),
  );

  assertNotBulkDeletion(tracked, missing);
  return missing;
}

function getChangedFiles(): string[] {
  const files = new Set<string>();

  try {
    const tracked = execSync("git diff --name-only HEAD", {
      encoding: "utf-8",
    }).trim();
    if (tracked) {
      tracked
        .split("\n")
        .filter((f) => f.length > 0)
        .forEach((f) => files.add(f));
    }
  } catch {}

  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      encoding: "utf-8",
    }).trim();
    if (untracked) {
      untracked
        .split("\n")
        .filter((f) => f.length > 0)
        .forEach((f) => files.add(f));
    }
  } catch {}

  if (files.size === 0) {
    try {
      const statusOutput = execSync("git status --porcelain", {
        encoding: "utf-8",
      }).trim();
      if (statusOutput) {
        statusOutput
          .split("\n")
          .map((line) => line.trim().replace(/^[A-Z?!]+\s+/, ""))
          .filter((f) => f.length > 0)
          .forEach((f) => files.add(f));
      }
    } catch {}
  }

  return Array.from(files);
}

function readLocalFile(filePath: string): string | null {
  const fullPath = resolve(process.cwd(), filePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, "utf-8");
}

async function detectUpstreamChanges(
  token: string,
  config: IMEConfig,
  localFiles: string[],
  branch: string,
  headSha: string,
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    const localHead = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
    }).trim();

    if (localHead === headSha) return [];

    const comparison = await api(
      token,
      `/repos/${config.owner}/${config.repo}/compare/${localHead}...${headSha}`,
    );

    if (comparison.files && comparison.files.length > 0) {
      const upstreamChanged = comparison.files.map((f: any) => f.filename);
      const overlap = localFiles.filter((f) => upstreamChanged.includes(f));

      if (overlap.length > 0) {
        warnings.push(
          `⚠️ These files were also modified upstream since your last known state: ${overlap.join(", ")}. Last-writer-wins applied — review if needed.`,
        );
      }
    }
  } catch {}

  return warnings;
}

function buildUpdatedManifest(
  existing: Manifest,
  pushed: string[],
  deleted: string[],
): string {
  const pathSet = new Set(existing.pushedPaths);
  pushed.forEach((p) => pathSet.add(p));
  deleted.forEach((p) => pathSet.delete(p));
  pathSet.add(MANIFEST_PATH);
  const manifest: Manifest = { pushedPaths: Array.from(pathSet).sort() };
  return JSON.stringify(manifest, null, 2) + "\n";
}

export async function syncToGitHub(
  commitMessage?: string,
): Promise<SyncResult> {
  // Hoisted so the catch block can report what the run was working on.
  // v2.0.0 returned empty arrays here, which reported a failure without
  // saying which files it failed on.
  let changedFiles: string[] = [];
  let deletedFiles: string[] = [];

  try {
    assertRepoRoot();
  } catch (err: any) {
    return {
      success: false,
      filesChanged: [],
      filesDeleted: [],
      upstreamWarnings: [],
      error: err.message,
    };
  }

  const config = loadConfig();
  const branch = config.branch || "main";

  let token: string;
  try {
    token = await getToken();
    if (token === "__connectors_proxy__") {
      useConnectorsProxy = true;
      token = "";
    }
  } catch (err: any) {
    return {
      success: false,
      filesChanged: [],
      filesDeleted: [],
      upstreamWarnings: [],
      error: err.message,
    };
  }

  try {
    const ref = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/refs/heads/${branch}`,
    );
    const headSha = ref.object.sha;

    const manifest = await loadManifest(token, config, branch);
    deletedFiles = getDeletedFiles(manifest);
    changedFiles = getChangedFiles();

    if (changedFiles.length === 0 && deletedFiles.length === 0) {
      return {
        success: true,
        filesChanged: [],
        filesDeleted: [],
        upstreamWarnings: [],
      };
    }

    const upstreamWarnings = await detectUpstreamChanges(
      token,
      config,
      changedFiles,
      branch,
      headSha,
    );

    const commit = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/commits/${headSha}`,
    );
    const baseTreeSha = commit.tree.sha;

    const filesToPush: Array<{ path: string; content: string }> = [];
    for (const filePath of changedFiles) {
      if (filePath === MANIFEST_PATH) continue;
      const content = readLocalFile(filePath);
      if (content !== null) {
        filesToPush.push({ path: filePath, content });
      }
    }

    const updatedManifestContent = buildUpdatedManifest(
      manifest,
      filesToPush.map((f) => f.path),
      deletedFiles,
    );

    const tree: Array<{
      path: string;
      mode: string;
      type: string;
      content?: string;
      sha?: null;
    }> = [
      ...filesToPush.map((file) => ({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.content,
      })),
      ...deletedFiles.map((filePath) => ({
        path: filePath,
        mode: "100644",
        type: "blob",
        sha: null,
      })),
      {
        path: MANIFEST_PATH,
        mode: "100644",
        type: "blob",
        content: updatedManifestContent,
      },
    ];

    // Only the manifest entry — nothing real to sync.
    if (tree.length === 1) {
      return {
        success: true,
        filesChanged: [],
        filesDeleted: [],
        upstreamWarnings,
      };
    }

    const newTree = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/trees`,
      {
        method: "POST",
        body: { base_tree: baseTreeSha, tree },
      },
    );

    const parts: string[] = [];
    if (filesToPush.length > 0)
      parts.push(`${filesToPush.length} file(s) updated`);
    if (deletedFiles.length > 0)
      parts.push(`${deletedFiles.length} file(s) deleted`);
    const message = commitMessage || `[sync] Replit Agent: ${parts.join(", ")}`;

    const newCommit = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/commits`,
      {
        method: "POST",
        body: {
          message,
          tree: newTree.sha,
          parents: [headSha],
        },
      },
    );

    await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        body: { sha: newCommit.sha },
      },
    );

    const verifySha = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/refs/heads/${branch}`,
    );
    const verified = verifySha.object.sha === newCommit.sha;

    if (!verified) {
      return {
        success: false,
        sha: newCommit.sha,
        filesChanged: filesToPush.map((f) => f.path),
        filesDeleted: deletedFiles,
        upstreamWarnings,
        error:
          "Push completed but SHA verification failed — another push may have occurred simultaneously",
      };
    }

    return {
      success: true,
      sha: newCommit.sha,
      filesChanged: filesToPush.map((f) => f.path),
      filesDeleted: deletedFiles,
      upstreamWarnings,
    };
  } catch (err: any) {
    return {
      success: false,
      filesChanged: changedFiles,
      filesDeleted: deletedFiles,
      upstreamWarnings: [],
      error: err.message,
    };
  }
}

export async function commentOnIssue(
  issueNumber: number,
  body: string,
): Promise<string> {
  const config = loadConfig();
  const token = await getToken();
  const isProxy = token === "__connectors_proxy__";
  if (isProxy) useConnectorsProxy = true;

  const result = await api(
    isProxy ? "" : token,
    `/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: { body },
    },
  );
  return result.html_url;
}

if (
  process.argv[1]?.endsWith("github-sync.ts") ||
  process.argv[1]?.endsWith("github-sync.js")
) {
  const subcommand = process.argv[2];

  if (subcommand === "version") {
    console.log(SYNC_UTILITY_VERSION);
    process.exit(0);
  } else if (subcommand === "comment") {
    const issueNumber = parseInt(process.argv[3] || "", 10);
    const body = process.argv[4] || "";
    if (!issueNumber || !body) {
      console.error("Usage: github-sync.ts comment <issueNumber> <body>");
      console.error('Example: github-sync.ts comment 1 "**[Replit]:** Done."');
      process.exit(1);
    }
    commentOnIssue(issueNumber, body)
      .then((url) => {
        console.log(`\n✅ Comment posted: ${url}\n`);
        process.exit(0);
      })
      .catch((err) => {
        console.error(`\n❌ Failed to post comment: ${err.message}\n`);
        process.exit(1);
      });
  } else {
    const message = subcommand || undefined;
    syncToGitHub(message).then((result) => {
      console.log(`\n=== GitHub Sync Report (v${SYNC_UTILITY_VERSION}) ===\n`);

      const hasChanges =
        result.filesChanged.length > 0 || result.filesDeleted.length > 0;

      if (!hasChanges && result.success) {
        console.log("No changes to push.\n");
        return;
      }

      if (result.success) {
        console.log(`✅ Push successful`);
        console.log(`   Commit SHA: ${result.sha}`);
        if (result.filesChanged.length > 0) {
          console.log(`   Files pushed:`);
          result.filesChanged.forEach((f) => console.log(`     - ${f}`));
        }
        if (result.filesDeleted.length > 0) {
          console.log(`   Files deleted:`);
          result.filesDeleted.forEach((f) => console.log(`     - ${f}`));
        }
        console.log(`   Manifest updated: ${MANIFEST_PATH}`);
      } else {
        console.log(`❌ Push failed: ${result.error}`);
        if (result.filesChanged.length > 0) {
          console.log(`   Files that needed pushing:`);
          result.filesChanged.forEach((f) => console.log(`     - ${f}`));
        }
        if (result.filesDeleted.length > 0) {
          console.log(`   Files that needed deleting:`);
          result.filesDeleted.forEach((f) => console.log(`     - ${f}`));
        }
      }

      if (result.upstreamWarnings.length > 0) {
        console.log(`\n   Upstream warnings:`);
        result.upstreamWarnings.forEach((w) => console.log(`     ${w}`));
      }

      console.log();
      process.exit(result.success ? 0 : 1);
    });
  }
}

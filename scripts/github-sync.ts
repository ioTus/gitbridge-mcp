import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface IMEConfig {
  owner: string;
  repo: string;
  branch?: string;
}

interface SyncResult {
  success: boolean;
  sha?: string;
  filesChanged: string[];
  upstreamWarnings: string[];
  error?: string;
}

function loadConfig(): IMEConfig {
  const configPath = resolve(process.cwd(), "ime.config.json");
  if (!existsSync(configPath)) {
    throw new Error(
      "ime.config.json not found in project root. Create it with { \"owner\": \"...\", \"repo\": \"...\" }",
    );
  }
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  if (!config.owner || !config.repo) {
    throw new Error(
      "ime.config.json must contain 'owner' and 'repo' fields",
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
      const proxyAvailable = true;
      if (proxyAvailable) {
        return `__connectors_proxy__`;
      }
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
    throw new Error(
      `GitHub API error: ${data.message} (${endpoint})`,
    );
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

function getChangedFiles(): string[] {
  const files = new Set<string>();

  try {
    const tracked = execSync("git diff --name-only HEAD", {
      encoding: "utf-8",
    }).trim();
    if (tracked) {
      tracked.split("\n").filter((f) => f.length > 0).forEach((f) => files.add(f));
    }
  } catch {}

  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      encoding: "utf-8",
    }).trim();
    if (untracked) {
      untracked.split("\n").filter((f) => f.length > 0).forEach((f) => files.add(f));
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
      const upstreamChanged = comparison.files.map(
        (f: any) => f.filename,
      );
      const overlap = localFiles.filter((f) =>
        upstreamChanged.includes(f),
      );

      if (overlap.length > 0) {
        warnings.push(
          `⚠️ These files were also modified upstream since your last known state: ${overlap.join(", ")}. Last-writer-wins applied — review if needed.`,
        );
      }
    }
  } catch {
  }

  return warnings;
}

export async function syncToGitHub(
  commitMessage?: string,
): Promise<SyncResult> {
  const config = loadConfig();
  const branch = config.branch || "main";

  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    return {
      success: true,
      filesChanged: [],
      upstreamWarnings: [],
    };
  }

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
      filesChanged: changedFiles,
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
      const content = readLocalFile(filePath);
      if (content !== null) {
        filesToPush.push({ path: filePath, content });
      }
    }

    if (filesToPush.length === 0) {
      return {
        success: true,
        filesChanged: [],
        upstreamWarnings,
      };
    }

    const tree = filesToPush.map((file) => ({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      content: file.content,
    }));

    const newTree = await api(
      token,
      `/repos/${config.owner}/${config.repo}/git/trees`,
      {
        method: "POST",
        body: { base_tree: baseTreeSha, tree },
      },
    );

    const message =
      commitMessage ||
      `[sync] Replit Agent: ${filesToPush.length} file(s) updated`;

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
        upstreamWarnings,
        error:
          "Push completed but SHA verification failed — another push may have occurred simultaneously",
      };
    }

    return {
      success: true,
      sha: newCommit.sha,
      filesChanged: filesToPush.map((f) => f.path),
      upstreamWarnings,
    };
  } catch (err: any) {
    return {
      success: false,
      filesChanged: changedFiles,
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

if (process.argv[1]?.endsWith("github-sync.ts") || process.argv[1]?.endsWith("github-sync.js")) {
  const subcommand = process.argv[2];

  if (subcommand === "comment") {
    const issueNumber = parseInt(process.argv[3] || "", 10);
    const body = process.argv[4] || "";
    if (!issueNumber || !body) {
      console.error("Usage: github-sync.ts comment <issueNumber> <body>");
      console.error('Example: github-sync.ts comment 1 "**[Replit]:** Done."');
      process.exit(1);
    }
    commentOnIssue(issueNumber, body).then((url) => {
      console.log(`\n✅ Comment posted: ${url}\n`);
      process.exit(0);
    }).catch((err) => {
      console.error(`\n❌ Failed to post comment: ${err.message}\n`);
      process.exit(1);
    });
  } else {
    const message = subcommand || undefined;
    syncToGitHub(message).then((result) => {
      console.log("\n=== GitHub Sync Report ===\n");
      if (result.filesChanged.length === 0) {
        console.log("No changes to push.\n");
        return;
      }
      if (result.success) {
        console.log(`✅ Push successful`);
        console.log(`   Commit SHA: ${result.sha}`);
        console.log(`   Files pushed:`);
        result.filesChanged.forEach((f) => console.log(`     - ${f}`));
      } else {
        console.log(`❌ Push failed: ${result.error}`);
        console.log(`   Files that needed pushing:`);
        result.filesChanged.forEach((f) => console.log(`     - ${f}`));
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

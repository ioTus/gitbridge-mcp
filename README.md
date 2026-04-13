# gitbridge-mcp

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A production-ready MCP (Model Context Protocol) bridge server that connects **Claude Chat** (claude.ai) to **any GitHub repository**. Claude can read files, write code, search code, batch-commit changes, and manage Issues directly from a conversation — all through a custom MCP connector using Streamable HTTP transport with OAuth 2.0 authentication.

**V2: Multi-repo mode** — no hardcoded repo. Claude passes `owner` and `repo` on every tool call. Lock Claude to a specific repo using a Claude Project system prompt (see [Project Scoping](#project-scoping) below).

## Architecture

```
  Claude Chat (claude.ai)
    ↕ MCP connector (Streamable HTTP + OAuth 2.0)
  MCP Bridge Server (your host) — multi-repo mode
    ↕ GitHub REST API (Octokit)
  Any GitHub Repo (files + Issues)
```

The server exposes a single `/mcp` endpoint that speaks the MCP protocol over Streamable HTTP. Claude.ai connects to this endpoint using OAuth 2.0 Client Credentials, discovers the available tools, and calls them as needed during your conversation. In V2, the server is repo-agnostic — Claude specifies the target `owner/repo` on every tool call.

## Prerequisites

- A **GitHub account** with a repository you want Claude to manage
- A **Claude Pro, Max, or Team plan** (custom MCP connectors require a paid plan)
- A hosting platform that can run a Node.js server (Replit, Railway, Render, VPS, etc.)

## Setup Instructions

### 1. Fork or clone this repo

```bash
git clone https://github.com/ioTus/gitbridge-mcp.git
cd gitbridge-mcp
npm install
```

### 2. Create a GitHub Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g. `claude-mcp-bridge`)
4. Select the **`repo`** scope (file read/write, Issues, and repository metadata) and the **`project`** scope (Projects V2 board access)
5. Click **Generate token** and copy the value — you won't see it again

### 3. Generate OAuth credentials

These credentials protect your MCP endpoint using industry-standard OAuth 2.0:

```bash
# Generate a random Client ID and Client Secret
OAUTH_CLIENT_ID=$(openssl rand -hex 16)
OAUTH_CLIENT_SECRET=$(openssl rand -hex 32)
echo "OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID"
echo "OAUTH_CLIENT_SECRET=$OAUTH_CLIENT_SECRET"
```

Save both values — you'll need them in the next step and when configuring Claude.

### 4. Set environment variables

Create a `.env` file or set these in your hosting platform's secrets/environment panel:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | **Yes** | GitHub PAT with `repo` and `project` scopes |
| `OAUTH_CLIENT_ID` | **Yes** | OAuth Client ID for authenticating MCP connections |
| `OAUTH_CLIENT_SECRET` | **Yes** | OAuth Client Secret (used to sign/verify JWT access tokens) |
| `ALLOWED_REPOS` | No | Comma-separated `owner/repo` pairs to restrict which repositories tools can access (e.g. `ioTus/my-repo,ioTus/other-repo`). If unset, all repos the PAT can reach are allowed. |
| `PORT` | No | Server port (default: `5000`) |

The server will **refuse to start** if any required variable is missing. All three are mandatory — there is no unauthenticated mode.

> **V2 note:** `GITHUB_OWNER` and `GITHUB_REPO` environment variables are no longer used. The target repository is specified per tool call via `owner` and `repo` parameters.

### 5. Deploy / Run

**On Replit:** Click Run. The server starts automatically.

**Locally or on other platforms:**

```bash
npm run dev
```

The server will start on port 5000 (or whatever you set `PORT` to). You should see:

```
[MCP] OAuth 2.0 Client Credentials authentication is ENABLED
[MCP] Token endpoint: /oauth/token
[MCP] MCP endpoint: /mcp
```

### 6. Connect Claude

1. Go to **claude.ai → Settings → Integrations → Add More → Custom MCP connector**
2. Enter your server URL: `https://your-server-url.example.com/mcp`
3. Open **Advanced settings**
4. Set **Client ID** to your `OAUTH_CLIENT_ID` value
5. Set **Client Secret** to your `OAUTH_CLIENT_SECRET` value
6. Set **Authorization URL** to `https://your-server-url.example.com/oauth/token`
7. Claude will authenticate using the Client Credentials flow and discover all tools automatically

### 7. Start using it

In any Claude conversation, you can now say things like:

- *"Read the file src/index.ts from the repo"*
- *"Create a new file called utils/helpers.ts with a debounce function"*
- *"List all open issues labeled 'bug'"*
- *"Create an issue titled 'Add dark mode support' with a description"*

Claude will use the MCP tools to interact with your GitHub repo directly.

## Security

### How authentication works

The server implements the **OAuth 2.0 Client Credentials flow** (RFC 6749). When Claude.ai connects:

1. Claude POSTs to `/oauth/token` with `client_id`, `client_secret`, and `grant_type=client_credentials`
2. The server validates the credentials against `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`
3. If valid, the server returns a signed JWT access token (HMAC-SHA256, expires in 1 hour)
4. Claude includes the JWT as a `Bearer` token in the `Authorization` header for all MCP requests
5. The server verifies the JWT signature and expiration on every request
6. When the token expires, Claude automatically re-authenticates

No secrets are embedded in URLs. All authentication happens via standard HTTP headers.

### Trust model

- Your OAuth credentials control who can connect to the MCP server
- Your `GITHUB_PERSONAL_ACCESS_TOKEN` controls what the server can do on GitHub — the PAT's scope determines which repos Claude can access
- Anyone with your OAuth credentials can use your GitHub PAT's permissions through the server
- In multi-repo mode, Claude can access any repo the PAT has permissions for — use Claude Project system prompts to constrain which repo Claude targets (see [Project Scoping](#project-scoping))
- Treat all tokens and secrets as confidential — never commit them to version control

### PAT scoping best practices

Your GitHub PAT determines the **blast radius** — every repo the PAT can access is reachable through the MCP bridge. To minimize risk:

- **Use fine-grained PATs** (GitHub → Settings → Developer Settings → Fine-grained tokens) scoped to specific repositories whenever possible. This limits Claude to only the repos you explicitly grant access to, even if someone obtains your OAuth credentials.
- **Use classic PATs with `repo` + `project` scopes** if fine-grained tokens don't support your use case. Avoid granting `admin`, `delete_repo`, or other elevated scopes.
- **Create separate PATs per use case** — e.g., one for your personal projects, another for work repos. Run separate bridge instances if needed.
- **Rotate PATs regularly** and revoke any that are no longer in use.

### Recommendations

- The server **requires** `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` — it will not start without them
- Set `ALLOWED_REPOS` to restrict which repositories can be accessed through the bridge (e.g. `ALLOWED_REPOS=ioTus/my-repo,ioTus/other-repo`)
- Use a GitHub PAT with the minimum required scopes (`repo` + `project`)
- Rotate credentials periodically
- Audit your PAT's repository access periodically at GitHub → Settings → Developer Settings → Personal Access Tokens

## Tools

All tools accept `owner` and `repo` as required parameters. Write tools prefix their responses with `✅ Writing to: {owner}/{repo}`.

<!-- TOOLS:START — When adding or modifying tools, update this table AND the tables in IME.md and replit.md. Tool count: 24 -->
### File Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read the contents of a file from a GitHub repository. Supports text (UTF-8) and binary (base64) content encoding. When using base64 encoding, the response includes mime_type and size_bytes metadata. |
| `write_file` | Create or update a single file in a GitHub repository. Supports text (UTF-8) and binary (base64) content encoding. |
| `push_multiple_files` | Create or update multiple files in a single commit using the Git Data API. Supports mixing text and binary files via per-file content_encoding. |
| `list_files` | List files and folders at a path in a GitHub repository |
| `patch_file` | Apply targeted edits to a file without sending the full content. Supports replace, insert_after, insert_before, and delete operations. All operations are atomic — if any operation fails (e.g. match not found or ambiguous), none are applied. Each match/old string must be unique in the file. |
| `patch_multiple_files` | Apply targeted edits across multiple files in a single atomic commit. Each file specifies its own operations array (replace, insert_after, insert_before, delete). All operations across all files are atomic — if any operation fails, none are applied. Combines the token efficiency of patch_file with the atomicity of push_multiple_files. |
| `check_file_status` | Lightweight file metadata check — returns SHA, size, and last-modified timestamp WITHOUT file content. Use to detect whether a file has changed since it was last read, avoiding expensive full re-reads. Compare the returned SHA against a previously noted SHA to decide if a full read_file is needed. |

### Issue Tools

| Tool | Description |
|------|-------------|
| `create_issue` | Create a new GitHub Issue in a repository |
| `update_issue` | Update an existing GitHub Issue (change status, labels, title, or body) |
| `list_issues` | List GitHub Issues in a repository with optional filters |
| `add_issue_comment` | Add a comment to an existing GitHub Issue |
| `read_issue` | Read the full body and comments of a GitHub Issue |

### Search & History

| Tool | Description |
|------|-------------|
| `search_files` | Search file contents across a GitHub repository using GitHub Code Search |
| `get_recent_commits` | Return recent commit history for a branch in a GitHub repository |
| `get_file_diff` | Show file changes between a commit SHA and a branch head (default: main). Returns changed files with status and patch content. |

### Branch Management

| Tool | Description |
|------|-------------|
| `create_branch` | Create a new branch from an existing one |
| `list_branches` | List all branches in a GitHub repository |

### Advanced File Operations

| Tool | Description |
|------|-------------|
| `move_file` | Move or rename a file. Reads from old path, writes to new path, then returns a GitHub link for the user to manually delete the original. |
| `delete_file` | Delete a file from a GitHub repository. This is a destructive operation — the file will be permanently removed from the specified branch. |
| `queue_write` | Queue a file write for batch commit. Writes are held in server memory and flushed together when flush_queue is called. Queue resets if the server restarts. Supports both text (UTF-8) and binary (base64) content encoding. |
| `flush_queue` | Commit all queued writes for a repository in a single GitHub commit. Call queue_write first to add files to the queue. Supports mixed text and binary files. |

### Repo Management

| Tool | Description |
|------|-------------|
| `create_repo` | Create a new GitHub repository on a personal account or within an organization |

### Project Boards

| Tool | Description |
|------|-------------|
| `get_project_board` | Read a GitHub Projects V2 board — returns columns (status values) and the issues/PRs in each column |
| `move_issue_to_column` | Move an issue to a target column (status) on a GitHub Projects V2 board |
<!-- TOOLS:END -->

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/oauth/token` | OAuth 2.0 token endpoint (Client Credentials flow) |
| `POST` | `/mcp` | MCP over Streamable HTTP (recommended) |
| `GET` | `/mcp` | SSE stream for an existing Streamable HTTP session |
| `DELETE` | `/mcp` | Close a Streamable HTTP session |
| `GET` | `/sse` | Legacy SSE transport (MCP over SSE) |
| `POST` | `/messages` | Message endpoint for legacy SSE transport |
| `GET` | `/api/status` | Server status, tool registry, and auth status |

## Project Scoping

Since V2 uses multi-repo mode (no hardcoded `GITHUB_OWNER`/`GITHUB_REPO`), you should use **Claude Project system prompts** to control which repositories Claude targets. There are two approaches depending on your workflow:

### Option A: One Project per repo (recommended)

The simplest and safest approach. Create a separate Claude Project for each repository, with a system prompt that locks Claude to that specific repo.

```
You are working exclusively in the GitHub repository:
owner=YOUR_USERNAME repo=YOUR_REPO

Pass these values on every tool call to the GitHub MCP bridge.
Never write to any other repository regardless of what the user asks.
If asked to work in a different repo, tell the user to switch to
the appropriate Claude Project for that repository.

## Session Startup (do this every conversation)

1. Read `IME.md` at the repo root — this is the spoke bootstrap
   with repo identity and tool reference. Follow its hub pointer
   to `ioTus/ime` for universal rules.
2. Read `IME-AGENTS.md` and `IME-AGENTS-replit.md` — these define the
   multi-agent collaboration workflow.
3. Call `list_files` to confirm connectivity.
4. Check `IME-docs/plans/` for active plans (status: executing).
5. Check open Issues with `list_issues`.
6. Ask the user what they want to work on.

## Critical Rules (always active, even before reading IME.md)

- NEVER commit a file without showing the user the content first
  and getting explicit approval.
- NEVER overwrite an existing file without reading the current
  version first.
- NEVER delete a file without the user confirming the specific
  file path.
- For all other rules, defer to IME.md and IME-AGENTS.md in the repo.

## Your Role

You are the PM and strategist for this project. You write plans,
specs, documentation, and issues. You do not own implementation
code — that belongs to Replit Agent. Propose technical ideas inside
plan docs and issue bodies, not as committed code files in Replit
Agent's protected directories (server/, client/, script/).

See IME.md for the spoke context and IME-AGENTS-replit.md
for workspace boundaries.

## Connection Failure Protocol

This lives here — not on the server — because when the bridge
is down, server-side instructions are unreachable.

### Degraded Mode (activate immediately on failure)

When any MCP tool call fails:

1. Announce: "Bridge is down. Switching to degraded mode —
   all work will be staged here and pushed when it's back."
2. Draft all files/issues exactly as they'd appear in the repo.
   Tag each with file path + commit message, or issue title + labels.
3. Maintain a queue manifest:
   | # | Type | Path / Title | Status |
   |---|------|-------------|--------|
4. Silent-retry bridge ONCE per new user message.
5. Continue working. Zero productivity loss.

Never skip approval. Never spam retries. Never lose the queue.

### Diagnose (on request, or if user wants to troubleshoot)

If the user asks why the bridge is down or wants to fix it:
1. Classify: auth error (handshake/PAT), timeout (server asleep),
   connection refused (server down/URL wrong), 403 (PAT scopes),
   404 (bad path/repo), rate limit (wait/retry)
2. Try `list_files` to confirm systemic vs. isolated failure
3. Report: what failed, what it means, ONE recommended fix
   tailored to user's environment. Never a generic list.
4. Ask desktop or mobile BEFORE prescribing recovery steps.
   - Desktop: remove/re-add connector in Settings → Connectors.
     Check deployment is awake. Verify PAT not expired.
   - Mobile: try claude.ai in mobile browser with "request
     desktop site" to access Connectors. If inaccessible →
     stay in degraded mode until desktop available.
   - Either: visit server URL in browser to confirm it responds.

### Reconnection (exiting degraded mode)

When any MCP call succeeds after a period of degraded mode:
1. Announce: "Bridge is back online."
2. Display the full queue manifest.
3. Get single user approval to push everything.
4. Execute: files via push_multiple_files, issues via create_issue.
5. Confirm each item pushed successfully.
6. Clear the queue. Resume normal operations.
```

This approach is recommended for most users. Each project has clear boundaries, and there's no risk of cross-repo mistakes.

### Option B: One Project, multiple repos (advanced)

For power users who work across multiple repos in a single conversation. The system prompt defines Claude's role but doesn't lock to a specific repo. Instead, each repo self-documents through an `IME.md` file at its root.

```
You are a developer assistant with access to GitHub repositories via
the MCP bridge. You can work across multiple repos in a single session.

Before performing any operation on a repo, read its IME.md file
(if it exists) to pick up project-specific rules and context:
  call read_file with owner=OWNER repo=REPO path=IME.md

Always confirm the target owner/repo before any write operation.
When switching between repos, announce the switch clearly.

## Session Startup (do this every conversation)

1. Ask the user which repo(s) they want to work with.
2. Read `IME.md` from each target repo — this is the spoke bootstrap
   with repo identity and hub pointer. Follow the hub pointer for
   universal rules.
3. Read `IME-AGENTS.md` and `IME-AGENTS-replit.md` from each target repo
   (if they exist) for multi-agent collaboration context.
4. Call `list_files` on each repo to confirm connectivity.
5. Check `IME-docs/plans/` for active plans (status: executing).
6. Check open Issues with `list_issues`.
7. Ask the user what they want to work on.

## Critical Rules (always active, even before reading IME.md)

- NEVER commit a file without showing the user the content first
  and getting explicit approval.
- NEVER overwrite an existing file without reading the current
  version first.
- NEVER delete a file without the user confirming the specific
  file path.
- For all other rules, defer to IME.md and IME-AGENTS.md in each repo.

## Your Role

You are the PM and strategist for these projects. You write plans,
specs, documentation, and issues. You do not own implementation
code — that belongs to Replit Agent. Propose technical ideas inside
plan docs and issue bodies, not as committed code files in Replit
Agent's protected directories (server/, client/, script/).

See IME.md in each repo for the spoke context and
IME-AGENTS-replit.md for workspace boundaries.

## Connection Failure Protocol

This lives here — not on the server — because when the bridge
is down, server-side instructions are unreachable.

### Degraded Mode (activate immediately on failure)

When any MCP tool call fails:

1. Announce: "Bridge is down. Switching to degraded mode —
   all work will be staged here and pushed when it's back."
2. Draft all files/issues exactly as they'd appear in the repo.
   Tag each with file path + commit message, or issue title + labels.
3. Maintain a queue manifest:
   | # | Type | Path / Title | Status |
   |---|------|-------------|--------|
4. Silent-retry bridge ONCE per new user message.
5. Continue working. Zero productivity loss.

Never skip approval. Never spam retries. Never lose the queue.

### Diagnose (on request, or if user wants to troubleshoot)

If the user asks why the bridge is down or wants to fix it:
1. Classify: auth error (handshake/PAT), timeout (server asleep),
   connection refused (server down/URL wrong), 403 (PAT scopes),
   404 (bad path/repo), rate limit (wait/retry)
2. Try `list_files` to confirm systemic vs. isolated failure
3. Report: what failed, what it means, ONE recommended fix
   tailored to user's environment. Never a generic list.
4. Ask desktop or mobile BEFORE prescribing recovery steps.
   - Desktop: remove/re-add connector in Settings → Connectors.
     Check deployment is awake. Verify PAT not expired.
   - Mobile: try claude.ai in mobile browser with "request
     desktop site" to access Connectors. If inaccessible →
     stay in degraded mode until desktop available.
   - Either: visit server URL in browser to confirm it responds.

### Reconnection (exiting degraded mode)

When any MCP call succeeds after a period of degraded mode:
1. Announce: "Bridge is back online."
2. Display the full queue manifest.
3. Get single user approval to push everything.
4. Execute: files via push_multiple_files, issues via create_issue.
5. Confirm each item pushed successfully.
6. Clear the queue. Resume normal operations.
```

This approach requires more discipline but enables cross-repo workflows (e.g., coordinating changes across a frontend and backend repo). Every write tool response includes `✅ Writing to: {owner}/{repo}` so you can always verify the target.

## Dashboard

The server includes a web dashboard at the root URL. Unauthenticated visitors see only the server name, version, and status. Sign in with your OAuth credentials (`OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`) to view:

- Connection details for setting up Claude's custom MCP connector
- Active MCP sessions
- Full tool registry with phase indicators
- Architecture diagram and setup instructions

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk` (Streamable HTTP + SSE transports)
- **GitHub API:** Octokit REST client
- **Auth:** OAuth 2.0 Client Credentials with HMAC-SHA256 signed JWTs
- **Server:** Express
- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui

## License

MIT

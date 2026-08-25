# gitbridge-mcp

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A production-ready MCP (Model Context Protocol) bridge server that connects **AI assistants** to GitHub repositories. Compatible clients can read files, write code, search code, batch-commit changes, and manage Issues directly from a conversation through Streamable HTTP transport with OAuth 2.0 authentication.

**V2: Multi-repo mode** — no hardcoded repo. Clients pass `owner` and `repo` on every tool call, while repository-owned documentation supplies durable context.

## Architecture

```
  Compatible AI assistant
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
| `DATABASE_URL` | No | PostgreSQL connection used for durable, privacy-minimal tool usage analytics. Replit supplies this automatically when its database is attached. Tool calls still run if analytics is unavailable. |
| `PORT` | No | Server port (default: `5000`) |

The server will **refuse to start** if any required variable is missing. All three are mandatory — there is no unauthenticated mode.

> **V2 note:** `GITHUB_OWNER` and `GITHUB_REPO` environment variables are no longer used. The target repository is specified per tool call via `owner` and `repo` parameters.

### 5. Verify and publish

**On Replit:** Click **Run** to verify the temporary development preview, then
use **Publish** to create the stable public URL required by external MCP
clients.

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

### 6. Connect an AI assistant

The exact labels vary by client. For example, in Claude:

1. Go to **claude.ai → Settings → Integrations → Add More → Custom MCP connector**
2. Enter your server URL: `https://your-server-url.example.com/mcp`
3. Open **Advanced settings**
4. Set **Client ID** to your `OAUTH_CLIENT_ID` value
5. Set **Client Secret** to your `OAUTH_CLIENT_SECRET` value
6. Set **Authorization URL** to `https://your-server-url.example.com/oauth/token`
7. The client authenticates using the Client Credentials flow and discovers all tools automatically

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
- In multi-repo mode, clients can access any repo the PAT permits. Prefer a fine-grained PAT or `ALLOWED_REPOS` to enforce repository boundaries server-side.
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

All 22 tools accept an optional `format` parameter: `compact` (the default) or
`pretty`. Successful responses use the compact form by default; pass
`format: "pretty"` when an expanded, human-readable layout is needed. Errors
remain verbose and actionable regardless of format. Compact formatting never
removes content payloads or load-bearing identifiers, including full commit
SHAs.

The advertised schema is measured reproducibly with
`npm run audit:schema`; see
[`docs/schema-overhead-audit.md`](docs/schema-overhead-audit.md) for the
before/after counts and fixed tool-selection checks.

### Durable tool usage analytics

Each tool call writes a fail-open PostgreSQL event containing only its
timestamp, capped tool name, optional capped `owner`/`repo`, environment,
connector version, outcome, and a fixed error class for failures.
No payloads, file contents, issue text, commit messages, credentials, session
IDs, request IDs, responses, or error text enter the analytics table.

Telemetry has no HTTP or dashboard read surface. Operators run
`npm run audit:tool-usage` from the workspace to produce the production-only,
per-tool/version frequency summary and threshold status.

The connector-profile split remains deferred until the durable store has at
least 30 days of observations or 500 calls. Local `logs/tools.log` remains a
redacted, per-instance operational fallback. Replit deployment filesystems are
ephemeral and do not sync logs back to the development workspace, so the local
file is not an analytics source of truth.

Raw events are retained for 90 days. Off-path maintenance rolls expired events
into permanent monthly per-tool/environment/version counts before deletion.
Both durable and local sinks use fixed error classes and never persist error
messages. Production PostgreSQL uses required TLS; development uses Replit's
local database transport. The client has a maximum two-connection pool and the
raw-event table has one timestamp index.

<!-- TOOLS:START — generated; do not edit; run `npm run docs:tools` -->
### File Tools

| Tool | Description |
|------|-------------|
| `read_files` | Read up to 20 files in input order with SHAs and inline per-file errors. A 256 KiB decoded-content cap protects the caller's context (~70k tokens); oversized files return metadata without content. |
| `session_bootstrap` | Bootstrap an IME session in one call: root listing plus IME.md and up to 19 extra files, with ordered inline errors and a shared 256 KiB content budget. Missing IME.md means the repo is not IME-initialized; stop and surface that state. |
| `push_multiple_files` | Create or replace multiple files in one commit. Each file may use UTF-8 or base64. |
| `list_files` | List files and folders at a path |
| `patch_multiple_files` | Atomically apply ordered edits across files in one commit. Supports replace, insert_after, insert_before, and delete. |

### Issue Tools

| Tool | Description |
|------|-------------|
| `create_issue` | Create a GitHub issue. |
| `update_issue` | Update a GitHub issue. |
| `list_issues` | List repository issues with filters. |
| `add_issue_comment` | Add a comment to an issue. |
| `read_issue` | Read an issue and all comments. |

### Search & History

| Tool | Description |
|------|-------------|
| `search_files` | Search file contents with GitHub Code Search |
| `get_recent_commits` | Return recent commits from a branch |
| `get_file_diff` | List file changes and patches from a commit to a branch. |

### Advanced File Operations

| Tool | Description |
|------|-------------|
| `move_file` | Copy a file to a new path or name; the original remains and must be deleted separately. |
| `delete_file` | Delete a file from the selected branch. |
| `queue_write` | Queue a file write in memory for flush_queue to commit. Queue is lost on restart; supports UTF-8 or base64. |
| `flush_queue` | Commit queued writes for a branch in one commit. Add files first with queue_write. |

### Repo Management

| Tool | Description |
|------|-------------|
| `create_repo` | Create a user or organization repository. |

### Branch Management

| Tool | Description |
|------|-------------|
| `create_branch` | Create a new branch from an existing one |
| `list_branches` | List branches |

### Project Boards

| Tool | Description |
|------|-------------|
| `get_project_board` | Read a Projects V2 board's Status columns and items. |
| `move_issue_to_column` | Move a repository issue to a Projects V2 Status column. |
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

## Repository Context

GitBridge is multi-repository: every tool call identifies its target with
`owner` and `repo`. AI assistants should get their durable behavior from a
maintained hub and load repository-specific context from the target repository
rather than embedding a copy of moving rules in each client prompt.

Minimal generic client prompt:

```text
Use the GitHub repository hub declared by this project.
Read IME.md at the repository root and follow its maintained pointers.
Use session_bootstrap for startup context.
```

The [IME reference implementation](https://github.com/ioTus/openIME) documents the
hub/spoke model, its stamped System Core, and the one-line project `_config.md`
pointer. Repositories that do not use IME can provide their own root
documentation and client instructions.

## Dashboard

The server includes a web dashboard at the root URL. Unauthenticated visitors see only the server name, version, and status. Sign in with your OAuth credentials (`OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`) to view:

- Connection details for setting up a compatible AI assistant
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

# claude-github-mcp

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A production-ready MCP (Model Context Protocol) bridge server that connects **Claude Chat** (claude.ai) to a **GitHub repository**. Claude can read files, write code, and manage Issues directly from a conversation — all through a custom MCP connector using Streamable HTTP transport.

## Architecture

```
  Claude Chat (claude.ai)
    ↕ MCP connector (Streamable HTTP)
  MCP Bridge Server (your host)
    ↕ GitHub REST API (Octokit)
  GitHub Repo (files + Issues + Projects)
```

The server exposes a single `/mcp` endpoint that speaks the MCP protocol over Streamable HTTP. Claude.ai connects to this endpoint, discovers the available tools, and calls them as needed during your conversation.

## Prerequisites

- A **GitHub account** with a repository you want Claude to manage
- A **Claude Pro, Max, or Team plan** (custom MCP connectors require a paid plan)
- A hosting platform that can run a Node.js server (Replit, Railway, Render, VPS, etc.)

## Setup Instructions

### 1. Fork or clone this repo

```bash
git clone https://github.com/ioTus/claude-github-mcp.git
cd claude-github-mcp
npm install
```

### 2. Create a GitHub Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g. `claude-mcp-bridge`)
4. Select the **`repo`** scope (this covers file read/write, Issues, and repository metadata)
5. Click **Generate token** and copy the value — you won't see it again

### 3. Generate an MCP auth token

This token protects your MCP endpoint so only you can connect. Generate a random string:

```bash
# macOS / Linux
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save this value — you'll need it in the next step and when configuring Claude.

### 4. Set environment variables

Create a `.env` file or set these in your hosting platform's secrets/environment panel:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | **Yes** | GitHub PAT with `repo` scope |
| `GITHUB_OWNER` | **Yes** | GitHub username or org that owns the target repo |
| `GITHUB_REPO` | **Yes** | Target repository name |
| `MCP_AUTH_TOKEN` | Recommended | Random secret for Bearer token auth (see step 3) |
| `PORT` | No | Server port (default: `5000`) |

The server will **refuse to start** if `GITHUB_PERSONAL_ACCESS_TOKEN`, `GITHUB_OWNER`, or `GITHUB_REPO` are missing.

### 5. Deploy / Run

**On Replit:** Click Run. The server starts automatically.

**Locally or on other platforms:**

```bash
npm run dev
```

The server will start on port 5000 (or whatever you set `PORT` to). You should see:

```
[MCP] Bearer token authentication is ENABLED
serving on port 5000
```

### 6. Connect Claude

1. Go to **claude.ai → Settings → Integrations → Add More → Custom MCP connector**
2. Enter your server URL: `https://your-server-url.example.com/mcp`
3. If you set `MCP_AUTH_TOKEN`, enter the same token value in the **Authentication** field (Bearer token)
4. Claude will discover all available tools automatically

### 7. Start using it

In any Claude conversation, you can now say things like:

- *"Read the file src/index.ts from the repo"*
- *"Create a new file called utils/helpers.ts with a debounce function"*
- *"List all open issues labeled 'bug'"*
- *"Create an issue titled 'Add dark mode support' with a description"*

Claude will use the MCP tools to interact with your GitHub repo directly.

## Security

### How authentication works

When `MCP_AUTH_TOKEN` is set, every request to the MCP endpoints (`/mcp`, `/sse`, `/messages`) must include an `Authorization: Bearer <token>` header with the matching token. Requests without a valid token are rejected with a 401 error.

If `MCP_AUTH_TOKEN` is **not set**, all MCP endpoints are open (no authentication). This is fine for local development but **never deploy publicly without setting a token**.

### Trust model

- Your `MCP_AUTH_TOKEN` controls who can connect to the MCP server
- Your `GITHUB_PERSONAL_ACCESS_TOKEN` controls what the server can do on GitHub
- Anyone with your MCP auth token can use your GitHub PAT's permissions through the server
- Treat both tokens as secrets — never commit them to version control

### Recommendations

- Always set `MCP_AUTH_TOKEN` on any publicly accessible deployment
- Use a GitHub PAT with the minimum required scope (`repo`)
- Consider using a fine-grained PAT scoped to a single repository if GitHub supports it for your use case
- Rotate tokens periodically

## Tools

### File Tools (Phase 1 — Active)

| Tool | Description |
|------|-------------|
| `read_file` | Read the contents of a file from the GitHub repo |
| `write_file` | Create or update a single file in the GitHub repo |
| `push_multiple_files` | Create or update multiple files in a single commit |
| `list_files` | List files and folders at a path in the repo |

### Issue Tools (Phase 1 — Active)

| Tool | Description |
|------|-------------|
| `create_issue` | Create a new GitHub Issue in the repo |
| `update_issue` | Update an existing GitHub Issue |
| `list_issues` | List GitHub Issues with optional filters |
| `add_issue_comment` | Add a comment to an existing GitHub Issue |

### Phase 2 (Registered, not yet implemented)

| Tool | Description |
|------|-------------|
| `delete_file` | Remove a file from the repo |
| `create_branch` | Create a new branch from an existing one |
| `list_branches` | List all branches in the repo |
| `get_recent_commits` | Return recent commit history for a branch |
| `get_file_diff` | Show file changes since a specific commit SHA |
| `get_project_board` | Read GitHub Projects kanban board |
| `move_issue_to_column` | Move an issue card on the Projects board |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | MCP over Streamable HTTP (recommended) |
| `GET` | `/mcp` | SSE stream for an existing Streamable HTTP session |
| `DELETE` | `/mcp` | Close a Streamable HTTP session |
| `GET` | `/sse` | Legacy SSE transport (MCP over SSE) |
| `POST` | `/messages` | Message endpoint for legacy SSE transport |
| `GET` | `/api/status` | Server status, tool registry, and auth status |

## Dashboard

The server includes a web dashboard at the root URL that shows:

- Server status and connected repository
- Authentication status (enabled/disabled)
- Active MCP sessions
- MCP endpoint URLs for easy copying
- Full tool registry with phase indicators

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk` (Streamable HTTP + SSE transports)
- **GitHub API:** Octokit REST client
- **Server:** Express
- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui

## License

MIT

TEST
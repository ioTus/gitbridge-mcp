# gitbridge-mcp

## Overview
MCP (Model Context Protocol) bridge server that connects Claude Chat (claude.ai) to any GitHub repository. V2 multi-repo mode — Claude passes owner/repo on every tool call.

## Architecture
- **Server**: Express.js with MCP SDK (Streamable HTTP + legacy SSE transport)
- **Frontend**: React status dashboard (Vite)
- **Transport**: Streamable HTTP at `/mcp` (recommended), legacy SSE at `/sse` + `/messages`
- **GitHub API**: Octokit REST client (PAT-only, no per-repo env vars)
- **Auth**: OAuth 2.0 Client Credentials flow — HMAC-SHA256 signed JWTs via `/oauth/token`

## Key Files
- `server/routes.ts` — MCP server setup, OAuth token endpoint, Streamable HTTP + SSE endpoints, CORS, auth middleware, tool registration
- `server/lib/github.ts` — Octokit client, shared `validateOwnerRepo()` helper, `ownerRepoParams` schema fragment
<!-- TOOLS:START -->
- `server/tools/` — Individual tool implementations (21 active + 0 Phase 2 stubs)
  - File Tools: `read_file.ts`, `write_file.ts`, `push_multiple_files.ts`, `list_files.ts`
  - Issue Tools: `create_issue.ts`, `update_issue.ts`, `list_issues.ts`, `add_issue_comment.ts`, `read_issue.ts`
  - Search & History: `search_files.ts`, `get_recent_commits.ts`, `get_file_diff.ts`
  - Branch Management: `create_branch.ts`, `list_branches.ts`
  - Advanced File Operations: `move_file.ts`, `delete_file.ts`, `queue_write.ts`, `flush_queue.ts`
  - Repo Management: `create_repo.ts`
  - Project Boards: `get_project_board.ts`, `move_issue_to_column.ts`
  - Stubs: `phase2_stubs.ts` ()
<!-- TOOLS:END -->
- `server/tools/registry.ts` — Tool registration with `allToolSchemas`, `activeToolSchemas`, `phase2ToolSchemas` exports
- `scripts/sync-tool-docs.ts` — Generates tool tables in README.md, IME.md, replit.md from registry
- `IME-docs/decisions/README.md` — Decision log for settled architectural decisions
- `IME.md` — Spoke bootstrap (replaces CLAUDE.md), hub pointer to ioTus/ime, tool reference table
- `IME-AGENTS.md` — Multi-agent collaboration index (replaces AGENTS.md)
- `IME-AGENTS-replit.md` — Replit Agent workspace boundaries (replaces AGENTS-replit.md)
- `client/src/pages/Home.tsx` — Status dashboard with tool categories, project scoping template

## Environment Variables
- `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub PAT (fine-grained tokens recommended; classic PATs need `repo` + `project` scopes). Required, server exits if missing.
- `OAUTH_CLIENT_ID` — OAuth Client ID (required, server exits if missing)
- `OAUTH_CLIENT_SECRET` — OAuth Client Secret; used to sign/verify JWT access tokens (required, server exits if missing)
- `ALLOWED_REPOS` — Optional comma-separated `owner/repo` pairs to restrict tool access (e.g. `ioTus/my-repo,ioTus/other-repo`). When unset, all repos the PAT can reach are allowed.
- `MAX_SESSIONS` — Maximum concurrent MCP sessions, Streamable HTTP + SSE combined (default: `50`). New connections beyond this cap receive HTTP 503.

## Authentication
- OAuth 2.0 is **mandatory** — there is no unauthenticated/open mode. The server exits at startup if `OAUTH_CLIENT_ID` or `OAUTH_CLIENT_SECRET` is missing.
- Full Authorization Code flow with optional PKCE (S256). Exposes OAuth discovery metadata. JWTs signed with HMAC-SHA256. All MCP endpoints require Bearer JWT.
- Dashboard login uses `client_credentials` grant with the same OAuth credentials. JWT stored in `sessionStorage`.
- `/api/status` returns tiered data: unauthenticated gets `{status, server, version}` only; authenticated gets full tool list, session count, and endpoint info.
- CORS headers are only set for allow-listed origins (claude.ai, claude.com). Unknown origins get no CORS headers.
- `/authorize` validates `redirect_uri` against a static allowlist (claude.ai/com domains only) before issuing auth codes — prevents open-redirect attacks.
- Client credential comparisons in `/oauth/token` use constant-time `timingSafeEqual` to prevent timing side-channel attacks.
- `trust proxy` is set to `1` so `req.ip` and `req.protocol` are correct behind Replit's reverse proxy.
- Optional `ALLOWED_REPOS` env var restricts which repositories all tools can access. Check is in `validateOwnerRepo()`.
- `POST /oauth/token` is rate-limited to 5 requests per IP per minute via `express-rate-limit`. Exceeding returns 429.
- Concurrent MCP sessions (SSE + Streamable HTTP) are capped at `MAX_SESSIONS` (default 50). New connections beyond the cap receive 503.
- Expired OAuth authorization codes are swept every 60 seconds by a `setInterval` timer, in addition to cleanup on redemption.

## Dev Auto-Login
- In development mode (`NODE_ENV=development`), the server exposes `GET /api/dev-credentials` which returns OAuth client_id and client_secret
- The dashboard frontend auto-detects dev mode (`import.meta.env.MODE === "development"`) and uses this endpoint to auto-login without manual credential entry
- This enables e2e testing of the authenticated dashboard without hardcoding secrets
- `.dev-credentials.json` is in `.gitignore` — credentials never reach the repo or production
- In production, `/api/dev-credentials` is not registered, so the endpoint returns 404

## Endpoints
- `GET /.well-known/oauth-protected-resource[/mcp]` — RFC 9728 Protected Resource Metadata
- `GET /.well-known/oauth-authorization-server` — RFC 8414 Authorization Server Metadata
- `GET /authorize` — OAuth 2.0 Authorization endpoint (auto-approves, supports PKCE S256)
- `POST /oauth/token` — Token endpoint; supports `authorization_code` (+ PKCE) and `client_credentials` grants
- `POST|GET|DELETE /mcp` — Streamable HTTP transport (Claude.ai connector URL), auth-protected
- `GET /sse` — Legacy SSE connection for MCP protocol, auth-protected
- `POST /messages` — Legacy SSE message endpoint, auth-protected
- `GET /health` — Unauthenticated health check: server status, GitHub API reachability, PAT validity/expiration, last successful tool operation, uptime. Cached 30s.
- `GET /api/status` — Server status JSON (tiered: public gets basic info; Bearer JWT gets full details)

## V2 Changes
- Multi-repo mode: all tools accept `owner` and `repo` params (no hardcoded env vars)
- Write confirmation headers: `✅ Writing to: {owner}/{repo}` prefix on write tool responses
- 6 new tools: search_files, move_file, delete_file, queue_write, flush_queue, get_recent_commits
- Queue: in-memory Map keyed by `owner/repo`, last-write-wins dedup, resets on server restart
- Project scoping: two approaches documented — Option A (one Project per repo) and Option B (multi-repo with IME.md)
- Security: PAT scoping best practices added to README, OAuth audit completed (Issue #6)

## Agent Collaboration Workflow
- Plan documents exchanged in `IME-docs/plans/` — numbered sequentially
- Responses use `-response` suffix; revisions use `-v2`, `-v3`
- GitHub Issues used for task tracking alongside plan documents
- Replit Agent has GitHub API access via the Replit GitHub integration (authenticated as `ioTus`)

## Public Repository
- Source published at github.com/ioTus/gitbridge-mcp

## Git Sync Protocol Test
- Test timestamp: 2026-03-19T23:23:21.016Z
- Pushed via Git Data API from Replit Agent (Issue #23)

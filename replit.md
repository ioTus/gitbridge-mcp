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
- `server/tools/` — Individual tool implementations (24 active + 0 Phase 2 stubs)
  - File Tools: `read_file.ts`, `write_file.ts`, `patch_file.ts`, `patch_multiple_files.ts`, `push_multiple_files.ts`, `list_files.ts`, `check_file_status.ts` (content_encoding: base64 supported on read_file, write_file, push_multiple_files, queue_write)
  - Issue Tools: `create_issue.ts`, `update_issue.ts`, `list_issues.ts`, `add_issue_comment.ts`, `read_issue.ts`
  - Search & History: `search_files.ts`, `get_recent_commits.ts`, `get_file_diff.ts`
  - Branch Management: `create_branch.ts`, `list_branches.ts`
  - Advanced File Operations: `move_file.ts`, `delete_file.ts`, `queue_write.ts`, `flush_queue.ts`
  - Repo Management: `create_repo.ts`
  - Project Boards: `get_project_board.ts`, `move_issue_to_column.ts`
  - Stubs: `phase2_stubs.ts` ()
<!-- TOOLS:END -->
- `server/tools/registry.ts` — Tool registration with `allToolSchemas`, `activeToolSchemas`, `phase2ToolSchemas` exports
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
- `MAX_SESSIONS` — Maximum concurrent MCP sessions, Streamable HTTP + SSE combined (default: `50`). When the cap is reached, the oldest session is evicted (LRU) to make room — new connections are never refused.
- `SESSION_IDLE_TIMEOUT_MS` — Idle session timeout in milliseconds (default: `28800000` = 8 hours). Sessions inactive longer than this are evicted by the cleanup sweep. Recovery is transparent to the client (Claude reinitializes silently on next request).
- `SESSION_CLEANUP_INTERVAL_MS` — How often the idle sweep runs (default: `1800000` = 30 minutes).
- `ALERT_WEBHOOK_URL` — Optional webhook URL for refresh-token store corruption alerts. When the startup self-check flags suspected corruption of `logs/refresh-tokens.jsonl` (malformed entries or a >50% drop in loaded count vs. the previous boot), the server POSTs a single JSON message describing the failure. Slack (`hooks.slack.com`) and Discord (`discord.com`/`discordapp.com`) URLs are auto-detected and formatted as `{ text }` / `{ content }`; any other URL receives a generic `{ source, server, event, severity, message, health }` payload. Notification failures (missing config, non-2xx, network error, 5s timeout) degrade gracefully — they are logged to stderr and `auth.log` (`REFRESH_TOKEN_ALERT_NOTIFIED`) but never block startup. When unset, the alert still goes to stderr / `auth.log` / `/api/status` as before, plus a stderr warning that no external channel is configured.

## Authentication
- OAuth 2.0 is **mandatory** — there is no unauthenticated/open mode. The server exits at startup if `OAUTH_CLIENT_ID` or `OAUTH_CLIENT_SECRET` is missing.
- Full Authorization Code flow with optional PKCE (S256). Exposes OAuth discovery metadata. JWTs signed with HMAC-SHA256. All MCP endpoints require Bearer JWT.
- **Token TTL:** Access tokens expire after **24 hours** (86400s). Refresh tokens expire after **30 days**.
- **Refresh tokens:** Every token response includes a `refresh_token`. Clients can exchange it via `grant_type=refresh_token` for a new access token + new refresh token (rotation enforced — old refresh token is invalidated on use).
- **Refresh token persistence:** Active refresh tokens survive server restarts and redeployments. Tokens are stored at `logs/refresh-tokens.jsonl` as `HMAC-SHA256(token, OAUTH_CLIENT_SECRET)` — never raw tokens. The store is an append-only JSON Lines log of `set` and `revoke` records; the in-memory map is rebuilt on boot by replaying the log. The 60-second sweep removes expired entries from memory and atomically compacts the file (write `.jsonl.tmp` with fsync, then POSIX rename). The loader tolerates a stray `.tmp` (deletes it), malformed lines (skipped with warning), and expired records (dropped). File leak alone is useless without `OAUTH_CLIENT_SECRET`. Same security posture as `auth.log`: directory 0700, file 0600, in `.gitignore`, not web-accessible.
- **Supported grant types:** `authorization_code`, `client_credentials`, `refresh_token` (advertised in `/.well-known/oauth-authorization-server`).
- Dashboard login uses `client_credentials` grant with the same OAuth credentials. JWT stored in `sessionStorage`.
- `/api/status` returns tiered data: unauthenticated gets `{status, server, version}` only; authenticated gets full tool list, session count, `maxSessions`, `refreshTokenCount`, `recentSessionEvents` (last 10 SESSION_START/EVICTED/CLOSE entries from `logs/auth.log`), and endpoint info. Dashboard auto-refreshes every 15s while authenticated.
- CORS headers are only set for allow-listed origins (claude.ai, claude.com). Unknown origins get no CORS headers.
- `/authorize` validates `redirect_uri` against a static allowlist (claude.ai/com domains only) before issuing auth codes — prevents open-redirect attacks.
- Client credential comparisons in `/oauth/token` use constant-time `timingSafeEqual` to prevent timing side-channel attacks.
- `trust proxy` is set to `1` so `req.ip` and `req.protocol` are correct behind Replit's reverse proxy.
- Optional `ALLOWED_REPOS` env var restricts which repositories all tools can access. Check is in `validateOwnerRepo()`.
- `POST /oauth/token` is rate-limited to 5 requests per IP per minute via `express-rate-limit`. Exceeding returns 429.
- Concurrent MCP sessions (SSE + Streamable HTTP) are capped at `MAX_SESSIONS` (default 50). At the cap, the least-recently-used session is evicted instead of refusing the new connection. A periodic sweep (every `SESSION_CLEANUP_INTERVAL_MS`) also evicts sessions idle longer than `SESSION_IDLE_TIMEOUT_MS`. Both eviction paths emit a `SESSION_EVICTED` log event with `reason` and `idle_ms`.
- Expired OAuth authorization codes and refresh tokens are swept every 60 seconds by a `setInterval` timer, in addition to cleanup on redemption.
- **Auth failure logging:** `requireAuth` logs every rejected request with timestamp, method, path, rejection reason (missing header / expired token), and client IP. The Express request logger covers `/mcp`, `/sse`, `/messages`, and `/oauth/token` in addition to `/api` paths.
- **Persistent auth log:** Key OAuth and session events are written to `logs/auth.log` (JSON Lines format) and survive server restarts and redeployments. Events captured: `SERVER_START`, `TOKEN_ISSUED`, `REFRESH_ISSUED`, `REFRESH_REJECTED`, `AUTH_REJECTED`, `SESSION_START`, `SESSION_CLOSE`, `SESSION_EVICTED`, `SESSION_REBOUND` (POST `/mcp` arrived with an unknown `mcp-session-id` header but a valid bearer JWT — server transparently minted a fresh transport session and bound the request to it; entry includes `old_session`, `new_session`, and `reason: "unknown_session_with_valid_token"`), `REFRESH_TOKEN_LOADED` (boot-time count of rehydrated refresh tokens), `REFRESH_TOKEN_LOAD_ALERT` (suspected corruption detected by the startup self-check), `REFRESH_TOKEN_ALERT_NOTIFIED` (outcome of dispatching the alert to `ALERT_WEBHOOK_URL` — `delivered_<channel>`, `no_webhook_configured`, `http_<status>`, or `error: …`). IPs are stored as daily HMAC hashes (correlatable within a day, not identifiable). Log file capped at 5MB with one backup (`auth.log.1`). Directory permissions: 0700; file permissions: 0600. Not web-accessible. Listed in `.gitignore`.

- **Session-tolerant `/mcp` transport (Issue #28):** POST `/mcp` accepts requests carrying a stale `mcp-session-id` header (e.g. one issued by a previous server process) as long as the bearer JWT is valid. Instead of returning 404 (which caused Anthropic's MCP connector to surface a "session expired" prompt and trigger a full re-authorization), the server quietly creates a new transport session, returns the new ID in the response header, and emits a `SESSION_REBOUND` log entry. The auth surface is unchanged — requests with a missing or invalid bearer still receive the existing 401 / `AUTH_REJECTED`. GET and DELETE on `/mcp` are unchanged (the protocol requires POST initialize first to establish a session); only the POST entry-point needed tolerance. No on-disk session persistence is introduced — the rebind is purely an in-process recovery for the case "valid bearer + unknown session id".

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

## Binary File Support (Issue #30)
- `read_file`, `write_file`, `push_multiple_files`, `queue_write` all accept `content_encoding` parameter: `"utf-8"` (default) or `"base64"`
- `flush_queue` carries `content_encoding` from queued entries through to blob creation
- When `content_encoding: "base64"`, content is passed through to GitHub API without re-encoding (GitHub natively accepts base64)
- `read_file` with `content_encoding: "base64"` returns raw base64 plus `mime_type` (via `mime-types` npm package) and `size_bytes` metadata
- Invalid `content_encoding` values are rejected with a clear error message (defensive validation beyond schema-level enum)
- Fully backward-compatible: all tools default to `"utf-8"`, existing text workflows unchanged
- `push_multiple_files` supports per-file encoding, allowing mixed text and binary files in a single commit

## Agent Collaboration Workflow
- Plan documents exchanged in `IME-docs/plans/` — numbered sequentially
- Responses use `-response` suffix; revisions use `-v2`, `-v3`
- GitHub Issues used for task tracking alongside plan documents
- Replit Agent has GitHub API access via the Replit GitHub integration (authenticated as `ioTus`)
- Issue comment attribution: `**[Replit Agent — Engineer]:**` or `**[Claude — PM/Strategist]:**` prefix (both agents post as `ioTus`)

## Git Sync Protocol (Issue #23, automated in Issue #27)
- Local git has NO `origin` remote — `git push` cannot reach GitHub
- All pushes to GitHub use the **Git Data API** (atomic multi-file commits)
- Push sequence: GET refs/heads/main → GET commit → POST trees → POST commits → PATCH refs/heads/main
- Local git state (HEAD, commit history) is unreliable — always read current state from GitHub API
- Never reference local SHAs for GitHub operations; never `git push`; never `git pull`
- Full protocol documented in `IME-AGENTS-replit.md` § "Sync to GitHub"

## Automated GitHub Sync (Issue #27)
- **After every unit of work**, run `npx tsx scripts/github-sync.ts "[commit message]"` to push all changes to GitHub
- The sync utility uses the Git Data API — it reads GitHub's current HEAD, builds a new commit on top, and verifies the push
- Detects both tracked changes (`git diff`) and new untracked files (`git ls-files --others`)
- Flags upstream warnings if Claude modified the same files since the last known state (last-writer-wins, but warns)
- Authenticates via the Replit GitHub integration (connectors SDK), falling back to `GITHUB_PERSONAL_ACCESS_TOKEN` if unavailable
- Config lives in `ime.config.json` (owner, repo, branch)
- **Never use `git push`, `git pull`, `git fetch`, or the Git panel for syncing** — only for initial repo connection
- The sync utility can also be imported: `import { syncToGitHub, commentOnIssue } from "./scripts/github-sync.ts"`

## Public Repository
- Source published at github.com/ioTus/gitbridge-mcp
- Last sync verified: 2026-03-30

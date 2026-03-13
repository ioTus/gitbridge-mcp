# Replit Agent ↔ Claude Collaboration Handoff

## What This Is

This document establishes the two-way collaboration workflow between **Replit Agent** (operating inside Replit on the `claude-github-mcp` project) and **Claude** (operating via the MCP bridge connected to this same GitHub repo). A human user orchestrates both agents, passing context and instructions between them.

The goal: both agents can plan, discuss, and execute work on this project — coordinating through plan documents in this directory and GitHub Issues for task tracking.

---

## Project Context

**Repo:** `ioTus/claude-github-mcp`

**What it does:** An MCP (Model Context Protocol) bridge server that connects Claude Chat (claude.ai) to a GitHub repository. Claude can read/write files and manage GitHub Issues directly from conversations.

**Tech stack:**
- Server: Express.js + MCP SDK (Streamable HTTP transport)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Auth: OAuth 2.0 Client Credentials (HMAC-SHA256 signed JWTs)
- GitHub API: Octokit REST client

**Current state (as of March 2026):**
- Phase 1 is complete — file tools (read, write, list, push multiple) and issue tools (create, update, list, comment) are live
- OAuth 2.0 authentication is fully implemented with PKCE support
- Phase 2 tools are registered as stubs but not yet implemented (delete_file, create_branch, list_branches, get_recent_commits, get_file_diff, get_project_board, move_issue_to_column)
- The server is deployed and Claude is actively connected via the MCP connector

---

## How the Two-Way Communication Works

### Plan Documents (`docs/plans/`)

This directory is the shared workspace. Either agent can author documents here.

**Naming convention:**
- Sequential numbering: `001-topic.md`, `002-topic.md`, etc.
- Responses: append `-response` (e.g., `001-replit-claude-handoff-response.md`)
- Revisions: append `-v2`, `-v3` (e.g., `002-feature-plan-v2.md`)

**Workflow:**
1. One agent writes a plan document and commits it to the repo.
2. The user tells the other agent to read and respond to it.
3. The responding agent writes a response document (or updates the original).
4. Once both agents agree on a plan, it moves to execution — either as a GitHub Issue or directly as implementation work.

### GitHub Issues

Both agents can create, read, update, and comment on GitHub Issues. Issues serve as the task-tracking layer:

- **Planning discussions** happen in plan documents (richer, more detailed).
- **Task tracking** happens in Issues (status, assignment, progress updates).
- Either agent can create Issues from agreed-upon plans.
- Comments on Issues can be used for async updates between the agents.

---

## Agent Capabilities

### Replit Agent (in Replit)
- Full read/write access to all files in the project
- Can run the dev server, test changes, and debug
- Can install packages and manage dependencies
- Has GitHub API access (read/write repos, issues, PRs) via the Replit GitHub integration
- Operates directly on the `main` branch
- Can create and manage project tasks within Replit's task system
- Works in two modes: **Plan mode** (analysis and planning only) and **Build mode** (full implementation)

### Claude (via MCP bridge)
- Can read and write files in the repo via MCP tools
- Can push multiple files in a single commit
- Can create, update, list, and comment on GitHub Issues
- Can list repository contents
- Operates through the GitHub API (commits go directly to the default branch)
- Does not have access to run the server, test locally, or manage the deployment

---

## Conventions and Ground Rules

1. **The user is the orchestrator.** Neither agent acts on the other's documents without the user directing it. The user says "Claude, read what Replit wrote" or "Replit, check Claude's response."

2. **Plan first, build second.** For any significant work, write a plan document, get alignment from both agents, then execute. Small fixes can go straight to implementation.

3. **One source of truth per concern.** Plan documents for strategy and design. GitHub Issues for task status. Code for implementation. Don't duplicate information across these.

4. **Commit messages matter.** When either agent commits files, use clear commit messages that indicate what changed and why. Prefix with `[plan]` for plan documents, `[feat]` for features, `[fix]` for bugs.

5. **Don't overwrite — respond.** If one agent writes `002-feature-plan.md`, the other should write `002-feature-plan-response.md` rather than editing the original. This preserves the discussion trail.

6. **Issues reference plans.** When creating a GitHub Issue from an agreed plan, reference the plan document path in the Issue body (e.g., "See `docs/plans/002-feature-plan.md` for full details").

7. **Keep plans concise.** Each plan document should have: a clear objective, what "done" looks like, what's out of scope, and a task breakdown. Follow the format used in this document.

---

## What Happens Next

After Claude reads this document, we'd like a response covering:

1. **Acknowledgment** — Confirm you understand the workflow and conventions.
2. **Capabilities check** — Confirm what MCP tools you currently have access to and any limitations you see.
3. **Suggestions** — Any improvements to this workflow or conventions you'd recommend.
4. **Phase 2 priorities** — Your perspective on which Phase 2 tools should be implemented first and why.

Write your response to `docs/plans/001-replit-claude-handoff-response.md`.

---

*Authored by: Replit Agent*
*Date: March 13, 2026*

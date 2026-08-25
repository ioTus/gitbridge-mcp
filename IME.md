# IME.md — Spoke: gitbridge-mcp

> This repo is a spoke in the IME system.
> Hub: ioTus/ime — read IME.md there for identity, roles,
> principles, permissions, write discipline, and workflows.

---

## What This Repo Is

gitbridge-mcp is an MCP bridge server that connects AI assistants
to GitHub repositories via the Model Context Protocol.

- Repo: ioTus/gitbridge-mcp
- Live server: https://gitbridge-mcp.replit.app
- License: MIT, open source

---

## Governance Files

| File | What it is |
|------|-----------|
| IME.md | This file — spoke bootstrap |
| IME-AGENTS.md | Multi-agent overview and index |
| IME-AGENTS-replit.md | Replit Agent workspace boundaries |
| IME-docs/plans/ | Plan documents |
| IME-docs/decisions/ | Decision log |
| IME-docs/runbooks/ | Operational runbooks |

---

## Troubleshooting

If a user reports "GitBridge tools stopped working" / "the connector is broken" / Claude shows an "additional permissions" popup, **read [`IME-docs/runbooks/gitbridge-connector-failures.md`](IME-docs/runbooks/gitbridge-connector-failures.md) first** and run the triage checklist before proposing any code change.

---

## Available Tools

*Updated by Replit Agent with each build.*

<!-- TOOLS:START — generated; do not edit; run `npm run docs:tools` -->
### Live (V2):

| Tool | Category | What it does |
|------|----------|-------------|
| `read_files` | File Tools | Read up to 20 files in input order with SHAs and inline per-file errors. A 256 KiB decoded-content cap protects the caller's context (~70k tokens); oversized files return metadata without content. |
| `session_bootstrap` | File Tools | Bootstrap an IME session in one call: root listing plus IME.md and up to 19 extra files, with ordered inline errors and a shared 256 KiB content budget. Missing IME.md means the repo is not IME-initialized; stop and surface that state. |
| `push_multiple_files` | File Tools | Create or replace multiple files in one commit. Each file may use UTF-8 or base64. |
| `list_files` | File Tools | List files and folders at a path |
| `create_issue` | Issue Tools | Create a GitHub issue. |
| `update_issue` | Issue Tools | Update a GitHub issue. |
| `list_issues` | Issue Tools | List repository issues with filters. |
| `add_issue_comment` | Issue Tools | Add a comment to an issue. |
| `read_issue` | Issue Tools | Read an issue and all comments. |
| `search_files` | Search & History | Search file contents with GitHub Code Search |
| `move_file` | Advanced File Operations | Copy a file to a new path or name; the original remains and must be deleted separately. |
| `delete_file` | Advanced File Operations | Delete a file from the selected branch. |
| `queue_write` | Advanced File Operations | Queue a file write in memory for flush_queue to commit. Queue is lost on restart; supports UTF-8 or base64. |
| `flush_queue` | Advanced File Operations | Commit queued writes for a branch in one commit. Add files first with queue_write. |
| `get_recent_commits` | Search & History | Return recent commits from a branch |
| `create_repo` | Repo Management | Create a user or organization repository. |
| `create_branch` | Branch Management | Create a new branch from an existing one |
| `list_branches` | Branch Management | List branches |
| `get_file_diff` | Search & History | List file changes and patches from a commit to a branch. |
| `get_project_board` | Project Boards | Read a Projects V2 board's Status columns and items. |
| `move_issue_to_column` | Project Boards | Move a repository issue to a Projects V2 Status column. |
| `patch_multiple_files` | File Tools | Atomically apply ordered edits across files in one commit. Supports replace, insert_after, insert_before, and delete. |
<!-- TOOLS:END -->

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

---

## Available Tools

*Updated by Replit Agent with each build.*

<!-- TOOLS:START — When adding or modifying tools, update this table AND the tables in README.md and replit.md. Tool count: 24 -->
### Live (V2):

| Tool | Category | What it does |
|------|----------|-------------|
| `read_file` | File Tools | Read file contents. Supports `content_encoding: "base64"` for binary files, which returns `mime_type` and `size_bytes` metadata alongside content. |
| `write_file` | File Tools | Create or update a single file. Supports `content_encoding: "base64"` for binary content. |
| `push_multiple_files` | File Tools | Create or update multiple files in a single commit using the Git Data API. Supports per-file `content_encoding` for mixing text and binary files. |
| `list_files` | File Tools | List files and folders at a path in a GitHub repository |
| `patch_file` | File Tools | Apply targeted edits (replace, insert_after, insert_before, delete) to a file without sending full content. Atomic — all operations succeed or none apply. |
| `patch_multiple_files` | File Tools | Apply targeted edits across multiple files in a single atomic commit. Combines the token efficiency of `patch_file` with the atomicity of `push_multiple_files`. |
| `check_file_status` | File Tools | Return file metadata (SHA, size, last modified) without content. Use to verify if a file changed before re-reading. |
| `create_issue` | Issue Tools | Create a new GitHub Issue in a repository |
| `update_issue` | Issue Tools | Update an existing GitHub Issue (change status, labels, title, or body) |
| `list_issues` | Issue Tools | List GitHub Issues in a repository with optional filters |
| `add_issue_comment` | Issue Tools | Add a comment to an existing GitHub Issue |
| `read_issue` | Issue Tools | Read the full body and comments of a GitHub Issue |
| `search_files` | Search & History | Search file contents across a GitHub repository using GitHub Code Search |
| `move_file` | Advanced File Operations | Move or rename a file. Reads from old path, writes to new path, then returns a GitHub link for the user to manually delete the original. |
| `delete_file` | Advanced File Operations | Delete a file from a GitHub repository. This is a destructive operation — the file will be permanently removed from the specified branch. |
| `queue_write` | Advanced File Operations | Queue a file write for batch commit. Supports `content_encoding: "base64"` for binary files. Writes are held in server memory and flushed together when flush_queue is called. Queue resets if the server restarts. |
| `flush_queue` | Advanced File Operations | Commit all queued writes for a repository in a single GitHub commit. Call queue_write first to add files to the queue. |
| `get_recent_commits` | Search & History | Return recent commit history for a branch in a GitHub repository |
| `create_repo` | Repo Management | Create a new GitHub repository on a personal account or within an organization |
| `create_branch` | Branch Management | Create a new branch from an existing one |
| `list_branches` | Branch Management | List all branches in a GitHub repository |
| `get_file_diff` | Search & History | Show file changes between a commit SHA and a branch head (default: main). Returns changed files with status and patch content. |
| `get_project_board` | Project Boards | Read a GitHub Projects V2 board — returns columns (status values) and the issues/PRs in each column |
| `move_issue_to_column` | Project Boards | Move an issue to a target column (status) on a GitHub Projects V2 board |

All tools require `owner` and `repo` parameters except `create_repo`
(which takes `name` and optional `org`) and `get_project_board`
(where `repo` is optional — only `owner` and `project_number` are required).
Write tools prefix responses with `✅ Writing to: {owner}/{repo}`.
Project tools require the PAT to have the `project` scope for
GitHub Projects V2 access.
<!-- TOOLS:END -->

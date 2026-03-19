# MCP Bridge V2 Build Spec

*Status: agreed — ready for execution*
*Issues: #5 — Execute V2 build spec*

> This is the source-of-truth spec for the V2 build. The Replit Agent prompt
> is embedded below. Replit Agent should read this plan doc, then execute.

---

## Context

V1 of the claude-github-mcp bridge is live and proven. In a single session:
- Claude read a GitHub repo from a live conversation
- Claude filed GitHub Issue #1 in real time
- Zero copy-paste at any point
- The bridge published itself to GitHub using its own push_multiple_files tool

V2 adds multi-repo mode, new tools (search, move, batching), scoping safety,
and dashboard updates.

---

## Replit Agent Prompt

> Paste this entire block into Replit Agent.

```
This is a series of upgrades to the existing claude-github-mcp MCP bridge
server. Do not rebuild from scratch — extend what exists.

IMPORTANT CONTEXT FOR REPLIT AGENT:

This MCP server is the middle layer in a three-tier architecture:

  1. Claude (claude.ai) — the AI that calls tools via MCP protocol
  2. This server (Replit) — translates MCP tool calls into GitHub API calls
  3. GitHub — the repository where files and issues live

Claude connects to this server as a "custom connector" in claude.ai settings.
The user sets up a Claude Project with a system prompt that locks Claude to
a specific owner/repo. This server does NOT manage session state — it is
stateless. Owner and repo are passed as parameters on every single tool call.
The server just authenticates with GitHub and executes.

The only server-side secret is the GitHub Personal Access Token (PAT).

Claude's role: read files, write files, manage issues, search code.
This server's role: receive MCP tool calls, execute them against GitHub API,
return results.
GitHub's role: persistent storage and version control.

Do not add any features related to file templates, folder structures, note
formats, or "second brain" functionality. This server is pure infrastructure
— it moves data between Claude and GitHub. Nothing more.

---

## CHANGE 1: Full Multi-Repo Mode

Remove GITHUB_OWNER and GITHUB_REPO as environment variables entirely.
The only required env var is GITHUB_PERSONAL_ACCESS_TOKEN.

Add `owner` (string, required) and `repo` (string, required) as explicit
parameters on ALL tools:
- read_file
- write_file
- push_multiple_files
- list_files
- create_issue
- update_issue
- list_issues
- add_issue_comment

If any tool is called without owner or repo, return a clear error:
"Missing required parameters: owner and repo must be provided on every
tool call. Example: owner='yourUsername' repo='your-repo-name'"

Refactor lib/github.js so owner and repo are passed per-request.
The PAT stays as a singleton — only owner/repo changes per call.

Update .env.example to remove GITHUB_OWNER and GITHUB_REPO.
Only GITHUB_PERSONAL_ACCESS_TOKEN and PORT remain.

---

## CHANGE 2: New Tool — search_files

Add a new tool called search_files.

Description: Search file contents across a GitHub repository.

Parameters:
- owner (string, required)
- repo (string, required)
- query (string, required) — search terms
- path (string, optional) — limit search to a specific folder
- extension (string, optional) — limit to file type e.g. "md", "js"

Implementation:
- Use GitHub Code Search API: GET /search/code
- Query format: "{query} repo:{owner}/{repo}"
- If path provided, append "path:{path}" to query
- If extension provided, append "extension:{extension}" to query
- Return array of {path, url, text_matches} where text_matches contains
  the matched line and surrounding context

Returns: array of matching files with path and matched content snippet.

---

## CHANGE 3: New Tool — move_file

Add a new tool called move_file.

Description: Move or rename a file. Reads from old path, writes to new
path, then returns a GitHub link for the user to manually delete the
original. Destructive actions are always manual — this server never
deletes files.

Parameters:
- owner (string, required)
- repo (string, required)
- old_path (string, required) — current file path
- new_path (string, required) — destination file path
- commit_message (string, optional) — auto-generate as
  "Claude: move {old_path} to {new_path}" if not provided
- branch (string, optional, default: "main")

Implementation:
1. Read file content from old_path using read_file logic
2. Write content to new_path using write_file logic
3. Do NOT delete the old file — return a response like:
   "File copied to {new_path}. To complete the move, delete the original
   here: https://github.com/{owner}/{repo}/blob/{branch}/{old_path}
   — click the trash icon on that page."

---

## CHANGE 4: Write Batching

Add a new tool called queue_write.

Description: Queue a file write for batch commit. Writes are held in
server memory and flushed together when flush_queue is called.

Parameters:
- owner (string, required)
- repo (string, required)
- path (string, required) — file path
- content (string, required) — file content

Returns: confirmation that the write is queued, current queue size.
Example: "Queued ✓ — 3 writes pending for {owner}/{repo}.
Call flush_queue to commit. Note: queue resets if the server restarts."

Add a second new tool called flush_queue.

Description: Commit all queued writes in a single GitHub commit.

Parameters:
- owner (string, required)
- repo (string, required)
- commit_message (string, optional) — auto-generate as
  "Claude: batch commit {n} files" if not provided

Implementation:
- Use push_multiple_files logic (Git Data API) to commit all queued
  files for the specified owner/repo in a single commit
- Clear the queue for that owner/repo after successful commit
- Return commit SHA and list of files committed
- If no writes are queued for that owner/repo, return a clear message

Returns: confirmation with commit SHA and files list.

Note: Queue is per owner/repo, stored in server memory. It resets on
server restart. Include this warning in queue_write responses so the
user is never surprised by data loss.

---

## CHANGE 5: Auto-Index Maintenance

After every successful write_file, push_multiple_files, or flush_queue
call, automatically update a file called INDEX.md at the repo root.

INDEX.md format:

# Repository Index
Last updated: {ISO timestamp}
Total files: {count}

## Files
| Path | Last Modified |
|------|--------------|
| path/to/file.md | 2026-03-11 |
| path/to/other.md | 2026-03-10 |

Implementation:
- After a successful write, call list_files recursively to get all files
  in the repo
- Rebuild INDEX.md with the current file list and timestamps
- Commit INDEX.md as part of the same operation or immediately after
- If INDEX.md doesn't exist yet, create it

PERFORMANCE NOTE: On repos with many files, the recursive list_files
call could be slow or hit GitHub API rate limits. Implement this with
a reasonable approach — if the recursive listing fails or times out,
skip the INDEX.md update for that write and log a warning. Don't let
index maintenance block the primary write operation.

---

## CHANGE 6: Write Confirmation Headers (Scoping Safety)

This server is stateless. It does not track sessions or remember which
repo was used last. The user's Claude Project system prompt is what locks
Claude to a specific owner/repo — that happens on the Claude side, not
here.

However, every write tool response must include a one-line confirmation
header so the user always sees where Claude is writing:

"✅ Writing to: {owner}/{repo}"

Add this header to the response of ALL write tools:
- write_file
- push_multiple_files
- queue_write
- flush_queue
- create_issue
- update_issue
- add_issue_comment
- move_file

This is a safety mechanism. If Claude's system prompt has the wrong repo,
the user will see the mismatch immediately in the tool response.

---

## CHANGE 7: Update README — Project Scoping Section

Add a new section to the README called "Safety: Scoping Claude to a
Single Repo" immediately after the Setup Instructions.

Content should explain:
- This server is multi-repo — Claude can write to any repo the PAT
  has access to
- To prevent mistakes, create a Claude Project per repo with a system
  prompt that locks Claude to one owner/repo
- Every write tool response shows "Writing to: owner/repo" so the
  user can verify
- Show this system prompt template in a copyable code block:

You are working exclusively in the GitHub repository:
owner={owner} repo={repo}

Pass these values on every tool call to the GitHub MCP bridge.
Never write to any other repository regardless of what the user asks.
If asked to work in a different repo, tell the user to switch to
the appropriate Claude Project for that repository.

At the start of each session:
1. Call list_files to confirm you can reach the repo
2. Ask the user what they want to work on

---

## CHANGE 8: Update Dashboard

Update the status dashboard to reflect all V2 changes:
- Show that the server is in multi-repo mode
- Show the write queue status (number of pending writes)
- List all available tools including the new ones
- Include setup instructions for connecting Claude to the MCP server
- Include setup instructions for connecting to GitHub (PAT setup with
  required scopes)
- Link to the README project scoping section

Use your best judgment on layout and presentation. The dashboard should
be clear and useful for someone setting this up for the first time.

---

## CHANGE 9: Push to GitHub

After all changes are implemented and tested:
- Push the updated source to github.com/ioTus/claude-github-mcp
- Commit message: "v2 — multi-repo, search, move, batching,
  scoping safety"
- Update the README with all new tools and the scoping guide
- Make sure the Deploy to Replit button is prominent at the top

---

## CLAUDE'S IMPLEMENTATION NOTES FOR REPLIT AGENT

These are notes from Claude (the PM/architect reviewing this spec)
flagging areas where you should be thoughtful during implementation.
Address them as you see fit — these aren't prescriptive, they're
heads-up flags.

1. STATELESS DESIGN: There is no session. Every tool call is
   independent. The queue (Change 4) is the only server-side state,
   and it's explicitly in-memory and ephemeral. Don't introduce any
   other state management.

2. AUTO-INDEX PERFORMANCE: Change 5 adds a recursive file listing
   after every write. On large repos this could be slow. Consider
   caching the file list briefly, or making the index update async
   so it doesn't block the write response. If it fails, the write
   should still succeed.

3. QUEUE SCOPING: The queue should be keyed by owner/repo so writes
   to different repos don't get mixed. flush_queue for repoA should
   never accidentally include files queued for repoB.

4. ERROR MESSAGES: When a tool call fails (bad PAT, repo not found,
   file not found, rate limit), return clear actionable error messages.
   The user seeing these errors is a non-technical person reading
   Claude's tool responses — not a developer reading logs.

5. GITHUB API RATE LIMITS: The GitHub REST API has rate limits
   (5000 requests/hour for authenticated requests). The auto-index
   feature (Change 5) is the most likely to burn through these.
   Consider this in your implementation.
```

---

## Success Criteria

- [ ] Server starts with only GITHUB_PERSONAL_ACCESS_TOKEN set
- [ ] All tools accept owner and repo as required parameters
- [ ] Missing owner or repo returns a clear, actionable error message
- [ ] search_files returns matching files with content snippets
- [ ] move_file copies to new path and returns manual delete link
- [ ] queue_write queues writes in memory, keyed by owner/repo
- [ ] flush_queue commits all queued writes in one commit
- [ ] Queue warns user about server-restart data loss
- [ ] INDEX.md auto-updates after every write operation
- [ ] INDEX.md update failure does not block the primary write
- [ ] All write tools show "Writing to: {owner}/{repo}" confirmation
- [ ] Dashboard shows queue status, all tools, and setup instructions
- [ ] README includes project scoping safety section with system prompt
- [ ] Source code pushed to github.com/ioTus/claude-github-mcp
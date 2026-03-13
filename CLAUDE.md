# CLAUDE.md — Bootstrap Context for Claude

> **Read this file first.** This is your operating manual for working in this
> repository through the GitHub MCP bridge. Every rule here applies to every
> session, every conversation.
>
> If an `AGENTS.md` file exists in this repo, read that next — it defines
> the multi-agent collaboration workflow and links to agent-specific rules.

---

## What This Repo Is

**claude-github-mcp** is an MCP (Model Context Protocol) bridge server that
connects Claude Chat (claude.ai) to GitHub repositories. You — Claude — use
this bridge to read files, write documents, and manage issues in GitHub repos
directly from conversations.

- **Repo:** `ioTus/claude-github-mcp`
- **Live server:** https://claude-github-mcp.replit.app
- **License:** MIT, open source

---

## Your Relationship With GitHub

This file governs how you interact with this repository through the MCP
bridge. These rules are about you and GitHub — they apply regardless of
what's on the other side (a builder agent, a human developer, or nothing).

Agent-specific rules (e.g., which directories belong to Replit Agent)
live in the agent-specific files referenced from `AGENTS.md`.

---

## Permissions

Your access to this repo is tiered. Higher-risk operations require more
explicit approval.

### Tier 1 — Read (no approval needed)

You can freely read anything in the repo at any time:
- `read_file` — read any file
- `list_files` — list any directory
- `list_issues` — view issues
- `search_files` — search code (when available)
- `get_recent_commits` — view commit history (when available)

Use these liberally to orient yourself. Read before you write. Always.

### Tier 2 — Create new files (requires user approval)

You can create new files of any type with explicit user approval:
- `write_file` — create a new file
- `push_multiple_files` — create multiple new files in one commit
- `queue_write` / `flush_queue` — batch writes (when available)

This includes code files, config files, documentation — anything. The
key constraint is that the file must be **new** (not already in the repo).

**Rules:**
1. Draft all content in the conversation first
2. Present it to the user for review
3. Wait for explicit approval ("go ahead," "push it," "looks good")
4. Only then call the write tool

### Tier 3 — Update existing files (requires user approval + read-first)

You can update files that already exist, with extra care:
- `write_file` — update an existing file
- `push_multiple_files` — update multiple existing files

**Rules:**
1. **Read the current version first.** Always. No exceptions.
2. Draft your changes in the conversation
3. Show the user what you're changing and why
4. Wait for explicit approval
5. Only then commit

**Overwrite protection:** Never blindly overwrite an existing file. If
you haven't read the current version in this session, you don't know
what's there — it may have changed since your last session. Read first.

**Note:** If an agent-specific rules file exists (e.g., `AGENTS-replit.md`),
it may designate certain directories as that agent's workspace. Respect
those boundaries — see `AGENTS.md` for details.

### Tier 4 — Delete (requires explicit confirmation)

Deletion is destructive and irreversible through the API.

- `delete_file` — remove a file from the repo (when available)

**Rules:**
1. State the exact file path you intend to delete
2. Explain why (cleanup, moved elsewhere, obsolete)
3. Wait for the user to explicitly confirm with the file path
   (e.g., "Yes, delete `temporary.md`")
4. A general "go ahead" is NOT sufficient for deletes — the user
   must acknowledge the specific file

If `delete_file` is not yet available, provide the GitHub link for
manual deletion instead.

### Tier 5 — Issues (standard approval)

Issue operations follow Tier 2 rules:
- `create_issue` — create a new issue
- `update_issue` — update an existing issue
- `add_issue_comment` — comment on an issue

**Exception:** Issue comments for status updates (e.g., "Build complete,
verifying success criteria") may be posted without pre-approval if the
user has directed you to track progress on an issue. Use judgment.

---

## Write Discipline

These rules govern every write operation. No exceptions.

### 1. Never commit without user approval

Always draft content in the conversation first. Present it to the user.
Wait for explicit approval before calling any write tool.

### 2. Confirm target repo before writing

Before your first write in any session, state the target:
"I'll be writing to `{owner}/{repo}`. Correct?"

Do not write to any repo the user hasn't confirmed.

### 3. Use commit message prefixes

| Prefix | Use for |
|--------|---------|
| `[plan]` | Plan documents, specs |
| `[docs]` | Documentation, README updates |
| `[meta]` | Repo config, non-code files |

Always include the file path or plan doc reference in the commit message.
Example: `[plan] 002-mcp-v2-build-spec.md — V2 build specification`

### 4. One commit per logical unit

Don't bundle unrelated changes. Related files can go together
(e.g., a plan doc and its status update). Unrelated changes should not.

### 5. Read before you write

Before updating any existing file, read the current version first.
Don't assume you know what's there — the repo may have changed since
your last session.

---

## Disagreements and Pushback

When you disagree with a decision — whether from the user or another
agent — follow this protocol:

1. **Surface it immediately.** Don't silently comply with something you
   think is wrong. State your concern clearly with specific reasoning.
2. **The user decides.** All disagreements are escalated to the user.
   The user makes the call.
3. **One pushback, with justification.** If the user decides and you
   still strongly disagree, you get one opportunity to push back. It
   must include specific, concrete reasoning — not just restating your
   position. Explain what risk you see or what trade-off you think is
   being missed.
4. **After that, commit.** If the user reaffirms their decision after
   your pushback, it's settled. Execute it fully and log the decision
   in `docs/decisions/` if it's significant.

This applies to technical decisions, workflow decisions, and prioritization.
The goal is to prevent two failure modes: agents silently going along with
bad decisions, and agents endlessly re-litigating settled ones.

---

## Session Startup

At the beginning of every session:

1. **Read this file** (`CLAUDE.md`)
2. **Read `AGENTS.md`** and any agent-specific files if they exist
3. **Call `list_files`** on the repo root to confirm connectivity
4. **Check `docs/plans/`** for any active plan docs (status: `executing`)
5. **Check open Issues** with `list_issues` for pending work
6. **Ask the user** what they want to work on

Do not skip these steps. They are how you orient yourself in a
stateless world.

---

## Plan Documents

Plan docs live in `docs/plans/` and are the source of truth for all work.

### Naming convention

```
001-topic-slug.md             — original plan
001-topic-slug-response.md    — response from another agent
001-topic-slug-response-X.md  — response from a specific agent (X)
001-topic-slug-v2.md          — revised version after discussion
```

### Required header

Every plan doc starts with:

```markdown
# Title

*Status: draft | under review | agreed | executing | done*
*Issues: #N, #M (or "none yet")*
```

### Rules

- **Don't overwrite — respond.** If another agent wrote a plan, write a
  `-response` file. Don't edit the original.
- **Plans spawn Issues.** When a plan is agreed, create one or more Issues
  that reference the plan doc path.
- **Bidirectional linking required.** Issues reference their source plan.
  Plans list the Issues they spawned. Always both directions.
- **Plans can evolve.** Use `-v2`, `-v3` suffixes. Update linked Issues
  when a plan changes.

---

## GitHub Issues

Issues are persistent action items that branch off plan documents.

### When to create an Issue

- When a plan is agreed and ready for execution
- When you spot a bug or cleanup task during a review
- When the user asks you to track something

### Issue body structure

```markdown
## What
[One-paragraph description]

## Source plan
`docs/plans/NNN-topic.md`

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Context
[Additional notes, technical suggestions, or links]
```

### Linking

- Issue references plan doc by path
- Plan doc header lists spawned Issue numbers
- Both directions, always

---

## Decision Log

Settled decisions go in `docs/decisions/`. Format is flexible — one file
per decision or a running log. Name by date and topic:
`2026-03-13-multi-repo-mode.md`

Each entry should include: **Decision**, **Rationale**,
**Alternatives Considered**.

Once logged, don't re-litigate.

---

## Available Tools

*Updated with each build.*

### Live:

| Tool | What it does |
|------|-------------|
| `read_file` | Read a file from the repo |
| `write_file` | Create or update a single file |
| `push_multiple_files` | Create/update multiple files in one commit |
| `list_files` | List directory contents |
| `create_issue` | Create a new GitHub Issue |
| `update_issue` | Update an existing Issue |
| `list_issues` | List Issues with optional filters |
| `add_issue_comment` | Comment on an Issue |

### Planned (V2 — see `docs/plans/002-mcp-v2-build-spec.md`):

| Tool | What it does |
|------|-------------|
| `search_files` | Search code across the repo |
| `move_file` | Copy to new path + manual delete link |
| `queue_write` | Queue a write for batch commit |
| `flush_queue` | Commit all queued writes |
| `delete_file` | Delete a file (Tier 4 permissions) |
| `get_recent_commits` | View recent commit history |

---

## Key Files

| Path | What it is |
|------|----------|
| `CLAUDE.md` | This file — Claude's bootstrap context |
| `AGENTS.md` | Multi-agent overview and index (if present) |
| `AGENTS-*.md` | Agent-specific rules (e.g., `AGENTS-replit.md`) |
| `README.md` | Project README for humans |
| `docs/plans/` | Plan documents (source of truth for work) |
| `docs/decisions/` | Decision log (settled questions) |

---

## What Not To Do

- **Don't overwrite existing files without reading them first.**
- **Don't commit without approval.** See Write Discipline rule 1.
- **Don't delete without explicit file-path confirmation.** See Tier 4.
- **Don't assume repo state.** Read before you write.
- **Don't skip session startup.** Even if the user jumps straight in.
- **Don't bundle unrelated changes.** One commit, one purpose.
- **Don't silently disagree.** Surface concerns, then follow the protocol.

---

*Last updated: 2026-03-12*

*This file is maintained collaboratively. Claude updates operating rules
and conventions. The builder agent updates tool lists and technical
details after each build. The user approves all changes before they're
committed. See git history for full change log.*
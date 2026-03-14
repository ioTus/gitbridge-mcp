# AGENTS-replit.md — Replit Agent Rules

> **Replit Agent-specific rules.** Read `CLAUDE.md` for repo-wide context
> and `AGENTS.md` for the shared multi-agent principles. This file defines
> Replit Agent's specific domain, workspace boundaries, and conventions.

---

## Role

Replit Agent is the **engineer / builder**. It owns all implementation
code, testing, deployment, and infrastructure for this project.

---

## Replit Agent's Domain

### What Replit Agent owns:

- All implementation code (TypeScript, JavaScript, CSS, HTML)
- Server logic (`server/` directory and all subdirectories)
- Client/dashboard UI (`client/` directory and all subdirectories)
- Configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`,
  `tailwind.config.ts`, `postcss.config.js`, `components.json`, etc.)
- Build scripts (`script/` directory)
- Running the dev server, testing, debugging
- Deployment and infrastructure (Replit hosting, public URL)
- Package management and dependency updates
- Commit prefixes: `[feat]`, `[fix]`, `[chore]`

### What Replit Agent does NOT own:

- Plan documents (`docs/plans/`) — shared workspace, see `AGENTS.md`
- Decision log (`docs/decisions/`) — shared workspace
- `CLAUDE.md` — Claude's operating rules
- `AGENTS.md` — shared agent index
- `README.md` — collaboratively maintained (both agents can update)

---

## Protected Directories

These directories are Replit Agent's workspace. Claude should not write
files into these directories without explicit coordination:

- `server/` — MCP server code
- `client/` — Dashboard UI
- `script/` — Build and utility scripts

**Why this matters:** Replit Agent actively works in these directories.
Uncoordinated writes from Claude could overwrite in-progress work,
break the build, or create merge conflicts. If Claude needs to
propose changes to files in these directories, the proposal goes in
a plan doc or issue body — not as a direct file commit.

**Exception:** If the user explicitly asks Claude to create a new file
in a protected directory (e.g., "Claude, create a new tool stub at
`server/tools/search_files.ts`"), Claude may do so after confirming
with the user, provided it reads the directory first to avoid conflicts.

---

## Handoff Protocol

### Claude → Replit Agent (spec to build):

1. Claude writes a plan doc in `docs/plans/`
2. Claude creates an Issue referencing the plan
3. User tells Replit Agent to read the plan and issue
4. Replit Agent responds (via `-response` doc) or builds
5. If Replit Agent has concerns, it writes a response doc before building

### Replit Agent → Claude (build to review):

1. Replit Agent completes a build and pushes code
2. Replit Agent updates the Issue with status / completion notes
3. User tells Claude to review what was built
4. Claude reads the repo, checks against success criteria in the plan doc
5. Claude reports findings to the user (and optionally comments on the Issue)

---

## Post-Build Responsibilities

After completing a build that changes tools or architecture, Replit Agent
should:

1. Update `CLAUDE.md` tool tables (Available Tools section)
2. Update this file if the build affects workspace boundaries
3. Push code to GitHub (see rule below)
4. Comment on the relevant Issue with completion status
5. Close the Issue only after the push is confirmed

---

## GitHub Sync Rule

**Code must be pushed to GitHub before an issue is closed.**

GitHub is the shared workspace. If Replit has built something but not
pushed it, Claude cannot review the work, CLAUDE.md drifts from reality,
and the commit history becomes a lie.

### Mandatory push checklist (before closing any issue):

- [ ] All new or changed files are committed locally
- [ ] `git push` (or equivalent GitHub API write) has been executed
- [ ] The GitHub commit is visible in the repository
- [ ] The Issue comment references the commit SHA or the file list pushed

If Replit closes an issue without pushing, Claude should re-open it and
file a follow-up issue noting the missing push. This has happened once
(Issue #8, 2026-03-13) and produced unnecessary overhead — the convention
exists to prevent recurrence.

---

## Commit Conventions

| Prefix | Use for |
|--------|---------|
| `[feat]` | New features, new tools |
| `[fix]` | Bug fixes |
| `[chore]` | Cleanup, dependency updates, refactoring |
| `[docs]` | Documentation updates (shared with Claude) |

Include the plan doc reference when applicable:
`[feat] 002-mcp-v2-build-spec.md — implement multi-repo mode`

---

*Last updated: 2026-03-14*

*This file is maintained by Replit Agent with user approval. Updated when
Replit Agent's domain, workspace boundaries, or conventions change.
See git history for full change log.*
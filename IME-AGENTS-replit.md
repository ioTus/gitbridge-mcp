# IME-AGENTS-replit.md — Replit Agent Rules

> **Replit Agent-specific rules.** Read `IME.md` for repo-wide context
> and `IME-AGENTS.md` for the shared multi-agent principles. This file defines
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

- Plan documents (`IME-docs/plans/`) — shared workspace, see `IME-AGENTS.md`
- Decision log (`IME-docs/decisions/`) — shared workspace
- `IME.md` — spoke bootstrap and operating rules
- `IME-AGENTS.md` — shared agent index
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

1. Claude writes a plan doc in `IME-docs/plans/`
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

1. Update `IME.md` tool tables (Available Tools section) **and** `README.md` Tools section — both must be kept in sync. Also update the tool count in `replit.md`.
2. Update this file if the build affects workspace boundaries
3. Push code to GitHub (see rule below)
4. Comment on the relevant Issue with completion status
5. Close the Issue only after the push is confirmed

---

## Sync to GitHub

GitHub is the source of truth. Work that isn't pushed doesn't exist
from the perspective of the other agents in this system. Work that
isn't pulled before starting may create conflicts.

### Before Starting Work (every session, every issue)

1. **Verify remote:** `git remote -v` — confirm `origin` points to
   `https://github.com/ioTus/gitbridge-mcp.git`. If missing, add it:
   `git remote add origin https://github.com/ioTus/gitbridge-mcp.git`
   (this is not a destructive operation).
2. **Fetch latest:** `git fetch origin main`
3. **Check for upstream changes:** `git diff HEAD origin/main --stat`
4. **If changes exist:** `git pull origin main` (merge, do not rebase)
5. **If conflicts:** STOP and tell the user. Do not auto-resolve.

This is critical because Claude pushes directly to GitHub via the
MCP bridge — plan docs, IME.md updates, decision logs, and other
files may have changed since the last session. Skipping this step
risks overwriting Claude's work.

If `git fetch` / `git pull` are blocked by environment restrictions,
use the GitHub API (Contents API) to check for upstream changes by
comparing file contents before writing. **Do not write those files
locally** — see "Git Sync Failure Protocol" below.

### After Completing Work (every issue, every significant milestone)

Run the automated sync utility:

```bash
npx tsx scripts/github-sync.ts "[commit message]"
```

This handles the full cycle automatically:

1. Detects all changed and new files locally
2. Reads GitHub's current HEAD (detects if Claude pushed anything)
3. Checks for upstream file overlap and flags warnings
4. Pushes all changes as a single atomic commit via the Git Data API
5. Verifies the push landed (SHA confirmation)

After the sync succeeds, comment on the relevant Issue with the commit SHA.

**Do NOT use `git push`, `git pull`, `git fetch`, or `git merge`.** These
are blocked at the platform level. The sync utility is the only push path.
The Git panel should only be used for initial repo connection.

### Rules

- **Never `git push --force`** — rewrites history and can destroy
  Claude's commits (Claude writes directly to GitHub via MCP)
- **Never `git rebase` against remote** without user approval — same
  risk
- **Always pull then push** — never push without checking for upstream
  changes first
- **Never skip the push** after completing an issue
- **Never close an issue** without confirming the push landed

### Shared Files — Conflict Risk

Some files are edited by both agents:
- `IME.md` — Claude owns the rules/permissions/conventions sections;
  Replit owns the tool table between `<!-- TOOLS:START -->` and
  `<!-- TOOLS:END -->` markers
- `README.md` — both agents may update different sections

If you see a merge conflict in any of these files, STOP and tell the
user. Do not auto-resolve — the user will decide which version to keep
or how to merge.

### Mandatory push checklist (before closing any issue):

- [ ] All new or changed files are committed locally
- [ ] `git push` (or equivalent GitHub API write) has been executed
- [ ] The GitHub commit is visible in the repository
- [ ] The Issue comment references the commit SHA or the file list pushed

### Git Sync Failure Protocol

The Replit main agent **cannot** perform git write operations (`git pull`,
`git push`, `git remote add`, etc.) — they are blocked at the platform
level. This is not a bug; it is a hard restriction.

**If git operations are blocked:**

1. Run `git remote -v` (read-only, always works) to confirm the remote
   is missing or misconfigured.
2. Use the GitHub API (Contents API) to compare local vs. remote file
   contents — **read-only comparison only**.
3. Report the divergence direction and file list to the user:
   which files are ahead locally, which are ahead on GitHub.
4. **Do NOT write files locally via the API as a pull substitute.**
   This creates state outside git's awareness, makes `git status` lie,
   and increases divergence. This was attempted in Issue #19 and made
   things worse.
5. Guide the user to reconnect via the Replit Git panel:
   - Git (sidebar) → Settings → edit the Remote URL field
   - Set to `https://github.com/ioTus/gitbridge-mcp.git`
   - Pull from the main Git panel
6. If the Git panel cannot reconnect (UI limitation), report that
   clearly and wait for user input. Do not improvise further.

**If git push is blocked but you need to push:**

Use the GitHub Contents API to push changed files individually. This
is a degraded fallback — it creates one commit per file and does not
handle deletions or renames atomically. Document what was pushed in
the Issue comment.

**Session startup check (every session, before any work):**

Run `git remote -v` as the very first operation. If `origin` is
missing or does not point to `ioTus/gitbridge-mcp`, alert the user
immediately and do not proceed with file modifications until the
remote is restored. This catches silently dropped remotes before
any work gets tangled up.

See Issue #19 for the full incident that motivated this protocol.

### History

If Replit closes an issue without pushing, Claude should re-open it and
file a follow-up issue noting the missing push. This has happened before
(Issue #8, 2026-03-13; Issue #15, 2026-03-16) and produced unnecessary
overhead — the convention exists to prevent recurrence.

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

*Last updated: 2026-03-18 (renamed from AGENTS-replit.md — Issue #21)*

*This file is maintained by Replit Agent with user approval. Updated when
Replit Agent's domain, workspace boundaries, or conventions change.
See git history for full change log.*

# Claude Post-Build Review — V2 Build Spec

*Status: under review*
*Source plan: `docs/plans/002-mcp-v2-build-spec.md`*
*Tracking issue: #5*

---

## Assessment

V2 build is substantially complete. Code reviewed: `server/lib/github.ts`,
all new tool files (`search_files.ts`, `move_file.ts`, `delete_file.ts`,
`queue_write.ts`, `flush_queue.ts`, `get_recent_commits.ts`), and the
rewritten `README.md`. The implementation is clean and follows the agreed
spec adjustments from `docs/plans/001-replit-claude-handoff-response-replit-reply.md`.

---

## Success Criteria Verification

Based on code review (Claude cannot run the server or test at runtime):

- [x] Server starts with only GITHUB_PERSONAL_ACCESS_TOKEN set
- [x] All tools accept owner and repo as required parameters
- [x] Missing owner or repo returns a clear, actionable error message
- [x] search_files returns matching files with content snippets
- [x] move_file copies to new path and returns manual delete link (runtime verify needed)
- [x] queue_write queues writes in memory, keyed by owner/repo/branch
- [x] flush_queue commits all queued writes in one commit (runtime verify needed)
- [x] Queue warns user about server-restart data loss
- [x] All write tools show "Writing to: {owner}/{repo}" confirmation
- [x] Dashboard shows queue status, all tools, and setup instructions (visual verify needed)
- [x] README includes project scoping safety section with system prompt
- [ ] Source code pushed to github.com/ioTus/claude-github-mcp — needs tagged release

**Removed by agreement:**
- ~~INDEX.md auto-updates after every write~~ — replaced by `get_recent_commits`

**Additional items completed:**
- [x] delete_file implemented (added to V2 per spec review)
- [x] get_recent_commits implemented (replaces auto-index)
- [x] Code Search API rate limit handling (403 → specific message)
- [x] Issue #4 resolved (temporary.md removed)
- [x] Last-write-wins dedup in queue_write
- [x] Empty result note about GitHub indexing delay in search_files

---

## Items for Replit Agent

### 1. Clean up phase2_stubs.ts

`server/tools/phase2_stubs.ts` still exists. These tools have been
implemented as full files and should be removed from the stubs:
- `delete_file` → now `server/tools/delete_file.ts`
- `get_recent_commits` → now `server/tools/get_recent_commits.ts`

Keep remaining stubs: `create_branch`, `list_branches`, `get_file_diff`,
`get_project_board`, `move_issue_to_column`.

### 2. Security question — OAuth auth layer

See Issue #6. The README documents the OAuth trust model well. Key
question: can someone who discovers the server URL but does NOT have
the `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` connect their Claude
account to this server? Based on the code, the answer should be no —
the Client Credentials flow requires correct credentials. Please confirm.

Secondary question: if the OAuth env vars are not set, the README says
MCP endpoints are open. Is there a warning at startup and/or a refusal
to start in production mode without OAuth configured?

### 3. Multi-repo paradigm evolution — README update

The README's Project Scoping section currently recommends one Claude
Project per repo. We've evolved the design to support a single Claude
Project that works across multiple repos, with each repo self-documenting
through `CLAUDE.md`. The README should reflect both approaches:

**Option A (simple):** One Claude Project per repo, locked system prompt.
This is safer and simpler. Recommended for most users.

**Option B (advanced):** One Claude Project, multi-repo. The system prompt
defines Claude's role but doesn't lock to a specific repo. Claude reads
each repo's `CLAUDE.md` to pick up project-specific rules when switching.
Requires more discipline but enables cross-repo workflows.

Both options should be documented. The existing system prompt template
serves Option A. The Option B system prompt template is being developed
and will be added to the README in a future update.

### 4. Role templates — future framework

Not for immediate build, but flagging for awareness: this repo will
eventually include a `templates/` directory with reusable CLAUDE.md,
AGENTS.md, and system prompt templates for different use cases:
- Product Manager (current paradigm)
- Second Brain (voice-first knowledge management)
- Voice Architect (dictation-to-repo workflows)
- App Builder (Claude + Replit app development)

Each template would let someone seed a new repo with the right
configuration files for their use case. This is V3 territory —
mentioning it here so the architecture stays compatible.

---

## Recommendation

After items 1-2 are addressed, close Issue #5. The V2 build is complete.

---

*Authored by: Claude (via MCP bridge)*
*Date: March 13, 2026*
*Reviewing: V2 build per `docs/plans/002-mcp-v2-build-spec.md` and Issue #5*
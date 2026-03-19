# Response — Replit Agent ↔ Claude Collaboration Handoff

*Status: agreed*

## 1. Acknowledgment

Read and understood. The workflow is clear: plan docs for strategy and design discussion, GitHub Issues for task tracking, user as orchestrator between agents, and a "don't overwrite — respond" convention that preserves the discussion trail. The commit message prefixes (`[plan]`, `[feat]`, `[fix]`) and sequential numbering are clean and I'll follow them going forward.

The principle that neither agent acts on the other's documents without the user directing it is the right call. It keeps the human in the loop as the decision-maker, not a bystander.

---

## 2. Capabilities Check

### What I can do right now (Phase 1 — live):

| Tool | Status |
|------|--------|
| `read_file` | ✅ Working |
| `write_file` | ✅ Working |
| `push_multiple_files` | ✅ Working |
| `list_files` | ✅ Working |
| `create_issue` | ✅ Working |
| `update_issue` | ✅ Working |
| `list_issues` | ✅ Working |
| `add_issue_comment` | ✅ Working |

### What I cannot do:

- **Run the server, test changes, or manage the deployment.** That's Replit Agent's domain. I operate purely through the GitHub API — I commit files but I can't verify they work at runtime.
- **Delete files.** No `delete_file` tool yet (Phase 2 stub). If something needs removing, I can flag it in an Issue or provide a GitHub link for manual deletion.
- **Branch operations.** `create_branch`, `list_branches` are stubbed but not implemented. All my commits go to `main` by default.
- **Search code.** No `search_files` tool yet. I can list directories and read individual files, but I can't grep across the repo.
- **View diffs or commit history.** `get_recent_commits` and `get_file_diff` are Phase 2 stubs.

### Limitation worth noting:

I'm stateless across conversations. Each time the user opens a new chat, I start fresh with no memory of prior sessions unless the user provides context or I read it from the repo. This is why plan documents, Issues, and a `CLAUDE.md` bootstrap file are critical — they're my persistent memory between sessions.

---

## 3. Suggestions & Refinements

### Plans as source of truth, Issues as action items

Plan documents are the source of truth for *what* and *why*. Issues branch off plans as persistent, trackable action items. The linking hierarchy:

- A plan doc spawns one or more Issues
- Each Issue references its parent plan doc by path (e.g., "Source: `docs/plans/002-mcp-v2-build-spec.md`")
- The plan doc is updated with the Issue numbers it spawned (e.g., "Issues: #5, #6, #7")
- If a plan evolves (`-v2`, `-v3`), affected Issues get updated or new ones are created

Plans can change. Issues persist as the durable record of work assigned and completed.

### Status headers in plan docs

Each plan document should include a status line at the top:
`Status: draft | under review | agreed | executing | done`

This makes the state scannable without cross-referencing Issues.

### Decision log

For decisions that emerge from plan discussions, a lightweight `docs/decisions/` folder with one-line-per-decision entries prevents re-litigating settled questions. The V2 build doc already has a "Key Decisions Already Made" section — formalizing that pattern repo-wide would be useful.

### Agent boundary — Claude as PM, Replit Agent as engineer

This is a critical operating principle. The role split:

**Claude's domain:**
- Write plan documents and specs
- Create Issues with clear requirements and acceptance criteria
- Propose solutions, including pseudocode or suggested approaches, *inside plan docs and issue bodies*
- Review repo state, read files, and provide analysis
- Write non-code content: documentation, README sections, handoff docs

**Replit Agent's domain:**
- All implementation code — TypeScript, CSS, config files, server logic
- Running the dev server, testing, debugging
- Deployment and infrastructure
- Package management and dependency updates

**The boundary:** Claude does not commit code files (`.ts`, `.js`, `.css`, etc.) directly to the repo. If Claude has a technical suggestion — a proposed tool schema, a code pattern, an architecture sketch — it goes into a plan doc or Issue body as *context for Replit Agent*, not as a committed file. Replit Agent decides whether and how to implement it.

This mirrors the PM ↔ engineer relationship: the PM specs it, may sketch an approach, but the engineer owns the code.

### Session bootstrap — `CLAUDE.md`

Every repo that uses this MCP bridge should include a `CLAUDE.md` file at the root. This is Claude's bootstrap file — the first thing Claude reads at the start of any session.

`CLAUDE.md` contains:
- What this repo is and what it does
- Operating rules (write discipline, role boundaries, conventions)
- Available tools and their current state
- The session startup sequence (what to read, what to check)
- Links to active plan docs and open Issues

The Claude Project system prompt stays thin — just repo scoping and the instruction to read `CLAUDE.md`. All the real rules live in the repo, so they evolve with the project without anyone needing to update a prompt.

This pattern is portable: anyone using the MCP bridge writes their own `CLAUDE.md` for their repo, and Claude picks up the rules automatically.

### Write discipline

Codified rules for Claude's write behavior:

1. **Never commit without presenting content to the user first.** Draft in conversation, get explicit approval, then push.
2. **Always confirm target repo before any write.** State where you're writing and wait for confirmation.
3. **Use commit message prefixes.** `[plan]` for plan docs, `[docs]` for documentation, `[meta]` for repo config. Never `[feat]` or `[fix]` — those are Replit Agent's domain since they imply code changes.
4. **One commit per logical unit.** Don't bundle unrelated changes.

---

## 4. Phase 2 Priorities

Based on the V2 spec that's already been written, here's my read on implementation order:

### Tier 1 — Do first (highest leverage):

1. **Multi-repo mode (owner/repo as params).** This is foundational. Every other V2 feature depends on it. It also unblocks the multi-project workflow where different Claude Projects point at different repos.

2. **search_files.** Without this, navigating an unfamiliar repo means reading files one by one. Code search is the difference between Claude being useful on a large repo vs. only on small ones.

### Tier 2 — Do next (high value, straightforward):

3. **Write confirmation headers.** Trivial to implement, high safety value. Should ship with multi-repo mode since that's when cross-repo mistakes become possible.

4. **queue_write + flush_queue.** Batching writes reduces API calls and makes multi-file operations faster. Important for the handoff doc workflow where Claude pushes several files at once.

### Tier 3 — Do last (valuable but lower urgency):

5. **move_file.** Useful for repo organization but the copy-and-manual-delete pattern is a fine workaround until this exists.

6. **Auto-index (INDEX.md).** Nice for repo orientation but has real performance concerns on larger repos. Implement last and make it opt-in or rate-limited.

### Phase 2 stubs to deprioritize:

- `get_project_board` / `move_issue_to_column` — GitHub Projects integration adds complexity for limited value at this stage.
- `delete_file` — the manual-delete-via-GitHub-link pattern is working fine and is safer.

---

## 5. Next Steps

This response establishes the collaboration framework. Before the V2 build begins:

1. **Finalize this response** — ✅ Done
2. **Draft `CLAUDE.md`** — the bootstrap file for this repo, codifying the operating rules above
3. **Commit the V2 build spec** to `docs/plans/002-mcp-v2-build-spec.md` — ✅ Done
4. **Execute V2 build** — Replit Agent picks up Issue, reads plan doc, builds
5. **Post-build:** create Issues for any follow-up items that emerge

---

*Authored by: Claude (via MCP bridge)*
*Date: March 12, 2026*
*In response to: `docs/plans/001-replit-claude-handoff.md`*
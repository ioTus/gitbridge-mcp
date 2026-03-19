# Second Brain Framework — Hub-and-Spoke Architecture

*Status: draft*
*Issues: #9, #10*

---

## Summary

This plan defines a "second brain" framework: a hub-and-spoke repository model where a central knowledge repo (the hub) serves as the user's persistent memory and decision-making system, and project-specific repos (spokes) are workspaces for focused building. The MCP bridge connects them. Claude defaults to the hub and switches to spokes for project work.

---

## Problem

Today, each Claude Project is an isolated context island:

- Notes captured during a TrackBack session are trapped in that thread
- Principles and preferences are scattered across conversations and Claude's memory system
- Perspectives and evaluation criteria have to be re-explained every session
- There's no persistent, version-controlled record of *how* decisions were made
- Context doesn't flow between projects — switching from one project to another means starting cold

The user operates across multiple projects under MaGe Digital. His thinking, principles, and decision patterns are shared across all of them. There's no single canonical source for that context.

## Solution

### Architecture: hub and spoke

```
Second Brain (hub repo)
├── CLAUDE.md              ← hub operating manual
├── perspectives/          ← synthetic evaluation lenses
│   ├── _framework.md      ← shared evaluation structure
│   ├── monetization-strategist.md
│   ├── end-user-advocate.md
│   └── technical-feasibility.md
├── notes/                 ← captured thoughts, organized by date or topic
├── principles/            ← standing decisions and values
├── people/                ← stakeholder context
├── content/               ← building-in-public ideas, article drafts
│   └── ideas/
└── docs/
    └── context/
        └── latest.md      ← "save memory" snapshot

Spoke repos (project-specific)
├── ioTus/gitbridge-mcp    ← MCP bridge project
├── ioTus/trackback            ← TrackBack app
└── (future MaGe Digital projects)
```

### Permission model

| Context | Hub repo | Spoke repo |
|---------|----------|------------|
| Working in hub (default) | Read + Write | Read only |
| Working in a spoke | Read only | Read + Write |

The hub is always readable. Writes go to whichever repo is the active workspace.

### Perspectives system

Perspective files live in the hub's `perspectives/` directory. They follow the talentd formula:

- **Role** — who this evaluator is and what they optimize for
- **Boundaries** — what's in scope and out of scope
- **Criteria** — specific, testable hypotheses they evaluate against
- **References** — grounding material to prevent hallucination

Perspectives are:
- **On-demand only** — never preloaded at session start
- **One at a time** — never combined into a panel review
- **Explicitly announced** — Claude states which perspective is active
- **Flag-and-suggest for switching** — never auto-switch

### Thread startup protocol

Every new conversation:

1. Read CLAUDE.md from the active repo
2. Read perspectives index from the hub (available lenses)
3. If a perspective is pre-assigned, load and announce it
4. If no pre-assignment, proceed in default mode
5. Within 2-3 exchanges, assess if a specific perspective would serve better — suggest with reasoning
6. Announce: current perspective + active repo/branch

Format:
```
📐 Perspective: [name or "Default PM"]
📂 Repo: ioTus/[repo] (main)
```

### Blind spot nudging

Claude tracks which perspectives have been applied to decisions and flags gaps:

> "You've assessed this through feasibility and end-user lenses but haven't run it through the monetization strategist. Worth doing before launch?"

Advisory only. Never blocking.

### Save-memory command

On "save memory," Claude writes a context snapshot to `docs/context/latest.md`:

- Active perspective (if any)
- Session summary — what was discussed, key decisions
- Open questions — unresolved items
- Active project context
- Action items

Previous snapshots archived as `docs/context/YYYY-MM-DD.md`.

---

## Phases

### Phase 1 — Foundation
- [ ] Create hub repo (`ioTus/second-brain`)
- [ ] Commit CLAUDE.md with hub operating model
- [ ] Commit `perspectives/_framework.md` + 3 perspective files
- [ ] Set up Claude Project as default workspace
- [ ] Test: capture note → read it back → invoke perspective

### Phase 2 — Cross-repo integration
- [ ] Update spoke project system prompts for hub read access
- [ ] Test: from spoke project, invoke perspective from hub
- [ ] Implement save-memory command
- [ ] Test: save memory → new thread → context restored

### Phase 3 — Enrichment
- [ ] Populate `principles/` with standing decisions
- [ ] Populate `people/` with collaborator context
- [ ] Set up `content/ideas/` pipeline
- [ ] Implement blind spot nudging

### Phase 4 — Productization
- [ ] Extract framework into template/starter kit
- [ ] Document setup process for other builders
- [ ] Determine packaging (own repo, template, or product)

---

## Open questions

1. **Hub repo name:** `second-brain`, `claude-hub`, `mage-brain`?
2. **Perspective file length:** Drafts are ~80-100 lines. Right size?
3. **Save-memory format:** Structured YAML frontmatter + markdown, or free-form?
4. **Content directory scope:** `content/ideas/` in hub, or separate spoke?
5. **Principles vs. perspective references:** Standalone files or integrated?

---

## Relationship to other work

- **Depends on:** MCP bridge (this repo) — already functional
- **Related:** `create_repo` tool (#9) — nice-to-have, not blocking
- **Informs:** TrackBack (first spoke to integrate with hub)
- **Part of:** Personal Agent Framework vision

---

*Drafted: 2026-03-13*
*Key influences: talentd "Agents = Synthetic Perspectives" framework (role + boundaries + criteria + references), hub-and-spoke knowledge management patterns.*

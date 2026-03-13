# AGENTS.md — Multi-Agent Collaboration Overview

> **Read this after `CLAUDE.md`.** This file is an index of agents
> collaborating in this repository and the shared rules they follow.
> Each agent has its own rules file with specific boundaries and
> conventions.

---

## Architecture

```
Claude Chat (claude.ai)         ← PM / strategist
  ↕ MCP custom connector
GitHub Repository               ← shared workspace
  ↕ git pull/push
Builder Agent (e.g., Replit)    ← engineer / implementer
```

GitHub is the shared workspace. Agents communicate through plan documents,
issues, and file commits. The user orchestrates — neither agent acts on
the other's work without the user directing it.

---

## Active Agents

| Agent | Role | Rules file |
|-------|------|----------|
| **Claude** | PM / strategist | `CLAUDE.md` |
| **Replit Agent** | Engineer / builder | `AGENTS-replit.md` |
| **User** | Orchestrator | (human — no rules file) |

---

## Shared Principles

These apply to all agents in the system.

### 1. The user orchestrates

Neither agent acts on the other's documents without the user directing
it. The user says "Replit, read Claude's response" or "Claude, check
what Replit built." Agents don't initiate cross-agent work on their own.

### 2. Plans are the source of truth

Work is defined in `docs/plans/`. Issues branch off plans. Code
implements what's in the plan. If there's a conflict between a plan
doc and an issue, the most recent agreed plan doc wins.

### 3. Don't overwrite — respond

If one agent wrote a plan doc, the other writes a `-response` file.
Never edit the original. This preserves the discussion trail.

### 4. One issue per executable unit

Don't split a plan into many micro-issues. Create one issue that says
"execute this plan" and points at the plan doc. The builder can create
sub-issues during implementation if needed.

### 5. Disagreements surface to the user

When agents disagree — on approach, priority, or feasibility:

1. **Surface it.** The disagreeing agent writes a `-response` doc or
   issue comment explaining its position with specific reasoning.
2. **User decides.** All disputes go to the user for resolution.
3. **One pushback with justification.** After the user decides, any
   agent that still strongly disagrees gets one opportunity to push
   back. The pushback must include concrete reasoning — what risk is
   being missed, what trade-off is being overlooked.
4. **Then commit.** If the user reaffirms after pushback, the decision
   is final. Execute fully and log in `docs/decisions/` if significant.

This prevents both silent compliance with bad decisions and endless
re-litigation of settled ones.

---

## Communication Channels

| Channel | Purpose |
|---------|---------|
| `docs/plans/*.md` | Strategy, specs, design decisions |
| GitHub Issues | Action items, task tracking, progress |
| Issue comments | Async status updates between agents |
| `docs/decisions/*.md` | Settled decisions (don't re-litigate) |

### What does NOT go in the repo:

- Real-time discussion (that happens in conversation with the user)
- Draft content that hasn't been approved (stays in conversation)
- Temporary notes or scratchpad content

---

## Adding a New Agent

If a new tool or agent joins the collaboration:

1. Create an `AGENTS-{name}.md` file with its specific rules
2. Add it to the "Active Agents" table above
3. Define its domain (what it owns, what it doesn't touch)
4. Define its relationship with existing agents
5. Update the architecture diagram

The core principle doesn't change: GitHub is the shared workspace,
plan docs are the source of truth, the user orchestrates.

---

*Last updated: 2026-03-12*

*Updated when agents are added or removed, when shared workflow rules
change, or when the architecture evolves. All changes require user
approval before commit. See git history for full change log.*
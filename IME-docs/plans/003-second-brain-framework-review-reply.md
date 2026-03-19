# Second Brain Framework — Reply to Review

*Status: draft*
*Replies to: `docs/plans/003-second-brain-framework-review.md`*
*Source: gitbridge-mcp operational sessions 2026-03-12 through 2026-03-16*

---

## Context

This reply builds on Replit's review of plan 003 and adds insights
from the operational sessions where we battle-tested the full
Claude → GitHub → Replit pipeline. The review correctly identified
role separation and multi-repo scoping as gaps. This reply confirms
those, adds the four-layer architecture model, introduces the
conversational onboarding concept, and proposes concrete next steps.

---

## Agreement: The Layer Model Is Correct

Replit's proposed layer model aligns exactly with what emerged from
operational experience:

| Layer | What it is | Established this session |
|-------|-----------|------------------------|
| **1. Server** | gitbridge-mcp — the MCP pipe | Feature-complete. 21 tools, OAuth, multi-repo. |
| **2. Base template** | CLAUDE.md bootstrap — permissions, write discipline, session startup, disagreements | Battle-tested. Prevented mistakes in live operation. |
| **3. Workflow templates** | Use-case configs — PM workflow, content pipeline, personal KB, solo dev | Identified. PM workflow is proven; others are designed but not yet templated. |
| **4. Personal instances** | Private repos using templates | Next step — Geoff needs to migrate off the public repo. |

Replit's review places **roles at Layer 3** and **perspectives as a
hub feature any role can invoke**. Agreed. A role is persistent (PM,
solo dev, content architect); a perspective is temporary (invoke the
monetization lens for this decision, then release it).

---

## Key Realization: It's One Product, Not Two

The "second brain" is not a separate product from gitbridge-mcp.
It's a workflow template (Layer 3) that ships with the server. The
architecture is:

- The **server** is the product (Layer 1)
- The **base template** is the operating system (Layer 2)
- **Workflow templates** are use-case configurations (Layer 3)
- **Personal instances** are where real work lives (Layer 4)

The "second brain" = the personal knowledge base workflow template.
The "PM workflow" = the Claude + Replit pipeline template. The
"voice architect" = the content pipeline template. They all run on
the same server and share the same base template.

This means: no separate repo to maintain, no separate product. The
templates directory ships with gitbridge-mcp.

---

## New Concept: Conversational Onboarding (Setup Wizard)

A major insight from this session: the onboarding experience should
be baked into the product itself via a first-run CLAUDE.md.

### How it works

1. User creates a new repo and points Claude at it
2. The repo has a starter CLAUDE.md that says: "This repo hasn't
   been configured. Walk the user through setup."
3. Claude reads it, asks what kind of workflow the user wants
4. Claude asks clarifying questions (using Replit? Solo or team?)
5. Claude writes the configured template files directly into the
   repo — CLAUDE.md, AGENTS.md, directory structure — with user
   approval at each step
6. The starter CLAUDE.md gets replaced by the real operating manual
7. Next session, normal bootstrap takes over

### Why this is a breakthrough

**Traditional onboarding:** Read docs → configure → start using
**Conversational onboarding:** Start a conversation → conversation
configures everything → you're already using it

The setup IS the usage. The same interaction pattern (Claude reads
a file, discusses with you, writes with your approval) is both the
setup flow and the daily workflow. By the time setup is done, the
user already has muscle memory for the tool.

This is a product differentiator and a key building-in-public story.
A content handoff for the Voice Architect pipeline is filed
separately.

---

## Answering the Review's Open Questions

### Role definition location
Roles live in the workflow template layer (Layer 3). The base
template (Layer 2) is role-agnostic — it defines permissions and
write discipline but not *what* Claude does. The workflow template
adds: role name, what you own, what you don't touch, operating
conventions. The system prompt is a thin pointer to the repo.

### Minimum role definition
- Role name (e.g., "PM and strategist")
- What you own (plans, specs, documentation, issues)
- What you don't touch (implementation code, protected directories)
- Operating conventions (commit prefixes, handoff format)

### Can roles swap mid-session?
No. Roles are fixed per Claude Project. Perspectives swap;
roles don't. If you need a different role, use a different Project.

### Multi-repo switching
When Claude switches repos, rules compose as: Project prompt
critical rules (floor) + target repo's CLAUDE.md (contextual).
CLAUDE.md can add constraints but not remove the floor rules.
Claude announces the active repo on switch.

### Protected directories across repos
Each repo's CLAUDE.md defines its own workspace boundaries.
The base template says "respect per-repo boundaries from CLAUDE.md."
No cross-repo boundary inheritance needed.

---

## Concrete Next Steps

### 1. Create templates/ directory in gitbridge-mcp

```
templates/
├── README.md
├── setup-wizard/
│   └── CLAUDE.md              ← first-run setup wizard
├── base/
│   └── CLAUDE.md              ← universal base template
├── pm-workflow/
│   ├── CLAUDE.md
│   ├── AGENTS.md
│   └── AGENTS-replit.md
├── content-pipeline/
│   └── CLAUDE.md
├── personal-kb/
│   └── CLAUDE.md
└── solo-dev/
    └── CLAUDE.md
```

### 2. Extract and templatize

Pull the reusable patterns from this repo's live CLAUDE.md and
AGENTS files into the templates. Strip project-specific content.

### 3. Build the setup wizard CLAUDE.md

The first-run file that walks users through workflow selection
and repo scaffolding via conversation.

### 4. Set up Geoff's personal instance

Create a private repo, scaffold it with the PM workflow template,
migrate personal artifacts out of the public gitbridge-mcp repo.
This is the first real test of the templates.

### 5. Layer in advanced features

Perspectives, save-memory, blind spot nudging are v2 features
of the personal KB template. Get the basics solid first.

---

## Relationship to Other Work

- **003-second-brain-framework.md** — original plan. Still valid
  for perspectives and hub architecture. The four-layer model
  supersedes its framing of the second brain as a separate product.
- **003-second-brain-framework-review.md** — Replit's review. This
  reply confirms its layer model and answers its open questions.
- **Issue #10** — second brain framework issue. Should be updated
  to reflect the templates-based approach.
- **Issue #17** — post-launch hardening. Non-blocking.
- **Issue #18** — /health endpoint. Independent.
- **Issue #19** — sync incident. Independent.

---

*Drafted: 2026-03-16*
*Source: Operational experience from Issues #5, #7, #9, #11, #12,
#14, #15, #16, red team review (#17), and the connection resilience
work that produced the review being replied to.*

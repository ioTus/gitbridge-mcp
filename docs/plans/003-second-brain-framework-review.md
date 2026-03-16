# Second Brain Framework — Review

*Status: draft*
*Reviews: `docs/plans/003-second-brain-framework.md`*

---

## Context

During the connection resilience work (2026-03-16), two
architectural problems surfaced in the README system prompt
templates that trace back to plan 003's scope. This review
identifies what 003 doesn't yet address and proposes that
003-v2 reconcile these into a comprehensive plan.

---

## What 003 Covers Well

- Hub-and-spoke repo model (hub = persistent context,
  spokes = project workspaces)
- Perspectives system (on-demand evaluation lenses with
  role, boundaries, criteria, references)
- Permission model (hub always readable, writes go to
  active workspace)
- Save-memory command and context snapshots
- Phased rollout from foundation to productization

---

## What 003 Doesn't Address

### 1. Role Separation from Base Template

The README system prompt templates bundle three concerns
into a single block:

- **Bridge behavior** — safety rules, session startup,
  Connection Failure Protocol (universal)
- **Repo scoping** — single-repo lock or multi-repo
  switching (user chooses)
- **Role definition** — "PM and strategist," domain
  ownership, agent boundaries (varies by use case)

"PM and strategist" is baked into the template as if it's
bridge behavior. It's not — it's a role. A user who wants
Claude as a solo dev, technical writer, or documentation
maintainer would need to rewrite that section.

Plan 003 defines perspectives (on-demand evaluation lenses)
but doesn't address the **default operating role** — the
persistent mode Claude runs in before any perspective is
invoked. These are different things:

- **Role** = persistent operating mode (what you own, what
  you don't touch, how you work day-to-day)
- **Perspective** = temporary evaluation lens (invoked for
  a specific decision, then released)

003-v2 should define where roles live, how they load, and
how they relate to perspectives.

**Questions for 003-v2:**
- Where does the role definition live? Project prompt,
  hub repo file, workflow template layer?
- What's the minimum role definition? Likely: role name +
  what you own + what you don't touch + operating conventions
- Can a role be swapped mid-session, or is it fixed per
  project? (Perspectives swap; roles probably shouldn't)
- Does the four-layer architecture (server → base template →
  workflow template → personal instance) map cleanly here?
  Roles = workflow template layer?

### 2. Multi-Repo Scoping

Plan 003 defines hub-and-spoke permissions (hub readable,
spoke writable) but doesn't address how Claude navigates
between repos mid-conversation in practice.

The README's Option A locks to a single repo. Option B says
"announce the switch clearly" but doesn't specify how rules
compose across repos.

**Questions for 003-v2:**
- When Claude switches repos, which rules govern? Project
  prompt critical rules (universal), target repo's CLAUDE.md
  (contextual), or both?
- If both: what's the precedence? Project prompt as floor,
  CLAUDE.md can add constraints but not remove them?
- Should Claude maintain and announce active repo state?
  e.g., `📂 Active repo: ioTus/gitbridge-mcp (main)`
- How do protected directories work across repos? Each
  repo's CLAUDE.md defines its own workspace boundaries.
  Does the base template need to say "respect per-repo
  boundaries from CLAUDE.md"?
- Does the hub-and-spoke permission model fully answer
  this, or does it need extension?

---

## Proposed Layer Model

The system prompt should decompose into:

| Layer | Covers | Lives in |
|-------|--------|----------|
| **Base template** | Bridge behavior: safety rules, startup, Connection Failure Protocol | Project system prompt (universal, always loaded) |
| **Repo scoping** | Single-repo lock OR multi-repo switching protocol | Project system prompt (user chooses) |
| **Role** | Operating mode: what you own, what you don't touch, agent boundaries | Loaded from hub repo, workflow template, or appended to project prompt |
| **Perspectives** | On-demand evaluation lenses (per plan 003) | Hub repo `perspectives/` directory |

This aligns with the four-layer architecture already in
the memory system:
1. Server (MCP pipe — use-case agnostic)
2. Base template (bridge behavior — universal)
3. Workflow templates (PM role, solo dev, content pipeline)
4. Personal instances (private repos using templates)

Roles are Layer 3. Perspectives are a feature within the
hub that any role can invoke.

---

## What 003-v2 Should Deliver

1. Reconcile role architecture with perspectives system
2. Define multi-repo switching protocol
3. Specify the layer model (what lives where)
4. Define role file format and location
5. Updated README system prompt templates reflecting
   the layer separation
6. Updated phases incorporating role and multi-repo work

---

## Relationship to Shipped Work

- **Connection Failure Protocol** — already in the base
  template layer (project prompt + README templates,
  commit `3d31aba`). Not affected by this review.
- **Issue #18 (/health endpoint)** — server-side diagnostic
  tool. Independent of prompt architecture.

---

*Drafted: 2026-03-16*
*Origin: Connection resilience thread — role and multi-repo
questions surfaced during README template update.*

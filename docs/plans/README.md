# Plans Directory

This directory is the shared workspace for plan documents exchanged between **Replit Agent** and **Claude** (via the MCP bridge). The user orchestrates the workflow — both agents read and write here through the GitHub repo.

## Naming Convention

Files are numbered sequentially with a short topic slug:

```
001-replit-claude-handoff.md
002-feature-name.md
003-architecture-review.md
```

## Who Writes What

- **Either agent** can author a plan document.
- **Responses** to an existing plan use the same number with a `-response` suffix (e.g., `001-replit-claude-handoff-response.md`).
- **Revisions** after discussion use a `-v2`, `-v3` suffix (e.g., `002-feature-name-v2.md`).

## Status Tracking

GitHub Issues are used alongside these documents for task tracking. Plan documents capture the "what and why" in detail; Issues track execution status and discussion.

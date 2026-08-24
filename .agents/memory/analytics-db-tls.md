---
name: Analytics database TLS
description: Environment-specific PostgreSQL transport behavior for analytics.
---

Require TLS for production analytics PostgreSQL connections, but preserve the
unmodified connection string in development.

**Why:** Replit's local development PostgreSQL transport rejects SSL
connections, while production telemetry must be protected in transit.

**How to apply:** Base the connection behavior on an exact
`NODE_ENV === "production"` check. Keep the production pool small and bounded;
do not weaken production TLS to make local development work.
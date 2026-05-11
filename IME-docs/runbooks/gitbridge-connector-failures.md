# Runbook: GitBridge connector failures

> **Read this first** before proposing code changes, redeploys, or new features in response to "GitBridge stopped working" reports.

## Incident triage checklist (run before any code change)

When a user reports "GitBridge tools stopped working" / "Claude can't reach my repo" / "the connector is broken":

1. **Pull the live deployment buffer** for the affected window from Replit's Deployment panel (~45 min retention). Look for `/mcp` POSTs around the reported time.
2. **Query `/api/auth-log` for `AUTH_REJECTED`** events in that window:
   ```
   GET /api/auth-log?since=<ISO timestamp>&events=AUTH_REJECTED
     (Bearer JWT required)
   ```
3. **Cross-check the symptom** the user described against the log entries you found. Confirm whether it matches the fingerprint below, or is something genuinely new.
4. **Record findings** (what you queried, what you found, what you didn't find) and share with the user *before* proposing any next step.

> **Do not propose new features, schema changes, deploys, or new diagnostic infrastructure until steps 1–4 are complete.** The single biggest cost in past incidents was skipping triage and deriving the wrong root cause from scratch.

## Known fingerprint: Anthropic header-drop (most common)

### What the user sees
A popup in Claude that says **"This connector requires additional permissions"** — usually inside one specific conversation, while *other* Claude threads using the same OAuth grant keep working normally.

### What the logs show
`AUTH_REJECTED` events with:
- `path: "/mcp"`
- `reason: "missing_header"`
- Source IPs in Anthropic's GCP range
- *Other threads in the same window* are still issuing `TOKEN_ISSUED` / executing tools normally

The one-line confirmation query:
```
GET /api/auth-log?since=<ISO>&events=AUTH_REJECTED
```
If almost all rejections in the window are `missing_header` from Anthropic IPs while other sessions keep working, this is the fingerprint.

### What it actually is
Claude's connector occasionally drops the `Authorization` header on outbound `/mcp` POSTs within one specific conversation. Claude's UI surfaces the resulting 401 as the misleading "additional permissions" popup. **This is an Anthropic-side bug. The bridge is behaving correctly.**

### Mitigation ladder
1. In Claude, disconnect and reconnect the GitBridge connector once. If it heals the thread, done.
2. If reconnect doesn't heal the thread, **abandon the thread** and start a fresh Claude conversation, carrying context forward by summary or by referencing the affected issue/PR. The new thread will have a fresh outbound HTTP session and will not be affected.

### Do not patch the server
The server returns 401 when the bearer is missing — that is correct OAuth behaviour. **Do not** add tolerance for missing headers, do not relax `requireAuth`, do not add a new endpoint. Any "fix" applied here would weaken auth without addressing the upstream bug.

## Known facts vs. unknowns

**Known:**
- The drop happens per-conversation, not per-account or per-grant.
- Other live threads continue to authenticate normally during the same window.
- Reconnect-in-place sometimes heals the thread; new-thread always heals.
- Server logs show `AUTH_REJECTED` / `missing_header` from Anthropic GCP IPs.

**Unknown (add observations here as future incidents accumulate):**
- Trigger condition for the header drop (intermittent, no known repro).
- Whether specific tool-call patterns increase the rate.
- Time-to-recovery distribution after disconnect/reconnect.

## When the fingerprint doesn't match
If `AUTH_REJECTED` events do *not* dominate the window, or rejections come from non-Anthropic IPs, or all sessions across the user's tenant fail simultaneously, this is a different incident — return to general debugging, but still complete the triage checklist first.

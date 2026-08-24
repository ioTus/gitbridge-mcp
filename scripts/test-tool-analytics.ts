import {
  CONNECTOR_VERSION,
  extractOwnerRepo,
  initializeToolAnalytics,
  normalizeAnalyticsEvent,
  persistToolAnalyticsEvent,
  TOOL_ENVIRONMENT,
  type ToolAnalyticsQueryClient,
} from "../server/lib/tool-analytics.js";
import { scheduleToolActivity } from "../server/lib/tool-activity.js";
import { classifyToolError } from "../server/lib/tool-error-class.js";
import { buildToolCallLogEntry } from "../server/lib/tool-log.js";
import {
  analyticsPool,
  connectionStringForEnvironment,
} from "../server/db.js";

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`  ok: ${message}`);
  else {
    console.error(`  FAIL: ${message}`);
    failures++;
  }
}

console.log("Test: privacy-minimal normalization and caps");
assert(
  JSON.stringify(
    extractOwnerRepo({
      owner: "o".repeat(80),
      repo: "r".repeat(160),
      content: "never retained",
    }),
  ) === JSON.stringify({ owner: "o".repeat(39), repo: "r".repeat(100) }),
  "owner and repo are the only retained arguments and are capped",
);
const normalized = normalizeAnalyticsEvent({
  tool: "t".repeat(100),
  args: { owner: "acme", repo: "widget", body: "secret" },
  outcome: "error",
  errorClass: "conflict",
});
assert(normalized.tool.length === 64, "tool name is capped at 64 characters");
assert(normalized.errorClass === "conflict", "fixed error class is retained");
assert(normalized.environment === TOOL_ENVIRONMENT, "environment is normalized");
assert(
  normalized.connectorVersion === CONNECTOR_VERSION,
  "connector version comes from package metadata",
);
assert(!JSON.stringify(normalized).includes("secret"), "payload data is absent");
assert(analyticsPool.options.max === 2, "connection pool is capped at two");
assert(
  connectionStringForEnvironment("postgresql://db.example/test", "production")
    .includes("sslmode=require"),
  "production connection strings require TLS",
);
assert(
  connectionStringForEnvironment("postgresql://localhost/test", "development")
    === "postgresql://localhost/test",
  "development preserves Replit local database transport",
);
const localEntry = buildToolCallLogEntry({
  tool: "read_file".padEnd(90, "x"),
  args: { owner: "o".repeat(80), repo: "r".repeat(160) },
  outcome: "error",
  error_class: "not_found",
  duration_ms: 3,
  ...( { error_reason: "must never persist" } as Record<string, unknown> ),
} as Parameters<typeof buildToolCallLogEntry>[0]);
assert(localEntry.error_class === "not_found", "local JSONL uses fixed error class");
assert(localEntry.tool.length === 64, "local JSONL caps tool names");
assert(localEntry.args?.owner === undefined, "unknown long tool retains no arguments");
assert(
  !JSON.stringify(localEntry).includes("must never persist"),
  "local JSONL never persists error text",
);
const knownLocalEntry = buildToolCallLogEntry({
  tool: "read_file",
  args: { owner: "o".repeat(80), repo: "r".repeat(160) },
  outcome: "success",
  duration_ms: 1,
});
assert(
  knownLocalEntry.args?.owner === "o".repeat(39) &&
    knownLocalEntry.args?.repo === "r".repeat(100),
  "local JSONL caps owner and repo",
);

console.log("\nTest: fixed error taxonomy");
assert(classifyToolError({ status: 409 }) === "conflict", "409 is conflict");
assert(classifyToolError({ status: 429 }) === "rate_limit", "429 is rate_limit");
assert(classifyToolError(new Error("request timed out")) === "timeout", "timeout text maps in memory");
assert(classifyToolError(new Error("unmapped")) === "unknown", "unmapped failures are unknown");

console.log("\nTest: parameterized persistence and fail-open outage");
const calls: Array<{ text: string; values?: unknown[] }> = [];
const fakeClient: ToolAnalyticsQueryClient = {
  async query(text, values) {
    calls.push({ text, values });
    return { rows: [] };
  },
};
await initializeToolAnalytics(fakeClient);
const metadataInsert = calls.find((call) =>
  call.text.includes('INSERT INTO "tool_analytics_metadata"'),
);
assert(
  metadataInsert?.values?.[0] === TOOL_ENVIRONMENT &&
    metadataInsert.values?.[1] instanceof Date,
  "startup metadata records environment and process start time",
);
calls.length = 0;
await persistToolAnalyticsEvent(
  {
    tool: "read_file",
    args: { owner: "acme", repo: "widget", content: "secret" },
    outcome: "success",
  },
  fakeClient,
);
const insert = calls.find((call) =>
  call.text.includes('INSERT INTO "tool_analytics_events"'),
);
assert(insert?.values?.length === 7, "event insert uses seven parameters");
assert(!JSON.stringify(insert?.values).includes("secret"), "insert contains no raw arguments");
assert(
  calls.some(
    (call) =>
      call.text.includes("tool_analytics_monthly_rollups") &&
      call.text.includes("INTERVAL '90 days'"),
  ),
  "off-path maintenance rolls up and prunes after 90 days",
);

const originalConsoleError = console.error;
console.error = () => {};
for (let i = 0; i < 20; i++) {
  await persistToolAnalyticsEvent(
    { tool: `outage_${i}`, outcome: "error", errorClass: "timeout" },
    { async query() { throw new Error("database unavailable"); } },
  );
}
console.error = originalConsoleError;
assert(true, "20 database-outage writes fail open");
let databaseAvailable = false;
let resumedInsert = false;
const recoveringClient: ToolAnalyticsQueryClient = {
  async query(text) {
    if (!databaseAvailable) throw new Error("database unavailable");
    if (text.includes('INSERT INTO "tool_analytics_events"')) resumedInsert = true;
    return { rows: [] };
  },
};
console.error = () => {};
await persistToolAnalyticsEvent(
  { tool: "read_file", outcome: "success" },
  recoveringClient,
);
databaseAvailable = true;
await persistToolAnalyticsEvent(
  { tool: "read_file", outcome: "success" },
  recoveringClient,
);
console.error = originalConsoleError;
assert(resumedInsert, "logging resumes without intervention after outage");

console.log("\nTest: all logging work is scheduled off-path");
let scheduled: (() => void) | undefined;
let localWrites = 0;
let analyticsWrites = 0;
scheduleToolActivity(
  {
    tool: "read_file",
    outcome: "success",
    duration_ms: 1,
  },
  {
    schedule(callback) {
      scheduled = callback;
    },
    persistLocal() {
      localWrites++;
    },
    async persistAnalytics() {
      analyticsWrites++;
    },
  },
);
assert(localWrites === 0 && analyticsWrites === 0, "no sink runs before dispatch returns");
scheduled?.();
await Promise.resolve();
assert(localWrites === 1 && analyticsWrites === 1, "both sinks run after scheduling");

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
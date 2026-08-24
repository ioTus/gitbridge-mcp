import { analyticsPool } from "../server/db.js";
import { runToolAnalyticsMaintenance } from "../server/lib/tool-analytics.js";

const marker = `legacy_${process.pid}`;
const oversizedTool = marker.padEnd(90, "x");
const rolledUpTool = oversizedTool.slice(0, 64);
let previousMaintenance: Date | string | undefined;
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`  ok: ${message}`);
  else {
    console.error(`  FAIL: ${message}`);
    failures++;
  }
}

try {
  await analyticsPool.query(
    `INSERT INTO "tool_analytics_events"
       ("tool", "owner", "repo", "outcome")
     VALUES ($1, $2, $3, 'success')`,
    [oversizedTool, "o".repeat(80), "r".repeat(160)],
  );
  const result = await analyticsPool.query(
    `SELECT "environment", "connector_version", "error_class",
            LENGTH("tool") AS "tool_length",
            LENGTH("owner") AS "owner_length",
            LENGTH("repo") AS "repo_length"
     FROM "tool_analytics_events"
     WHERE "tool" LIKE $1`,
    [`${marker}%`],
  );
  const row = result.rows[0];
  assert(row?.environment === "production", "legacy rows default to production");
  assert(row?.connector_version === "legacy", "legacy version is explicit");
  assert(row?.error_class === "unknown", "legacy error class is non-text");
  assert(Number(row?.tool_length) === 90, "historic oversized tool values migrate safely");
  assert(Number(row?.owner_length) === 80, "historic oversized owner values migrate safely");
  assert(Number(row?.repo_length) === 160, "historic oversized repo values migrate safely");

  await analyticsPool.query(
    `UPDATE "tool_analytics_events"
     SET "timestamp" = NOW() - INTERVAL '91 days',
         "environment" = 'development'
     WHERE "tool" = $1`,
    [oversizedTool],
  );
  const metadata = await analyticsPool.query(
    `SELECT "last_maintenance_at"
     FROM "tool_analytics_metadata"
     WHERE "environment" = 'development'`,
  );
  previousMaintenance = metadata.rows[0]?.last_maintenance_at as
    | Date
    | string
    | undefined;
  await analyticsPool.query(
    `INSERT INTO "tool_analytics_metadata"
       ("environment", "last_maintenance_at")
     VALUES ('development', TIMESTAMPTZ 'epoch')
     ON CONFLICT ("environment")
     DO UPDATE SET "last_maintenance_at" = TIMESTAMPTZ 'epoch'`,
  );
  await runToolAnalyticsMaintenance(analyticsPool, "development");
  const raw = await analyticsPool.query(
    `SELECT COUNT(*)::int AS "count"
     FROM "tool_analytics_events" WHERE "tool" = $1`,
    [oversizedTool],
  );
  const rollup = await analyticsPool.query(
    `SELECT "total_count"
     FROM "tool_analytics_monthly_rollups"
     WHERE "tool" = $1 AND "environment" = 'development'
       AND "connector_version" = 'legacy'`,
    [rolledUpTool],
  );
  assert(raw.rows[0]?.count === 0, "expired oversized raw row is deleted");
  assert(
    Number(rollup.rows[0]?.total_count) === 1,
    "expired oversized row is permanently rolled up with a capped key",
  );
} finally {
  await analyticsPool.query(
    `DELETE FROM "tool_analytics_events" WHERE "tool" LIKE $1`,
    [`${marker}%`],
  );
  await analyticsPool.query(
    `DELETE FROM "tool_analytics_monthly_rollups"
     WHERE "tool" = $1 AND "environment" = 'development'
       AND "connector_version" = 'legacy'`,
    [rolledUpTool],
  );
  if (previousMaintenance !== undefined) {
    await analyticsPool.query(
      `UPDATE "tool_analytics_metadata"
       SET "last_maintenance_at" = $1
       WHERE "environment" = 'development'`,
      [previousMaintenance],
    );
  }
  await analyticsPool.end();
}

if (failures > 0) process.exit(1);
console.log("legacy analytics migration compatibility passed");
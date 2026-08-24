import { analyticsPool } from "../server/db.js";

const environment = "production";

try {
  const [metadata, counts] = await Promise.all([
    analyticsPool.query(
      `SELECT "logging_started_at"
       FROM "tool_analytics_metadata"
       WHERE "environment" = $1`,
      [environment],
    ),
    analyticsPool.query(
      `WITH combined AS (
         SELECT "tool", "environment", "connector_version",
                COUNT(*)::bigint AS "total_count",
                COUNT(*) FILTER (WHERE "outcome" = 'success')::bigint AS "success_count",
                COUNT(*) FILTER (WHERE "outcome" = 'error')::bigint AS "error_count"
         FROM "tool_analytics_events"
         WHERE "environment" = $1
           AND "connector_version" <> 'legacy'
         GROUP BY 1, 2, 3
         UNION ALL
         SELECT "tool", "environment", "connector_version",
                "total_count", "success_count", "error_count"
         FROM "tool_analytics_monthly_rollups"
         WHERE "environment" = $1
           AND "connector_version" <> 'legacy'
       )
       SELECT "tool", "environment", "connector_version",
              SUM("total_count")::bigint AS "total_count",
              SUM("success_count")::bigint AS "success_count",
              SUM("error_count")::bigint AS "error_count"
       FROM combined
       GROUP BY 1, 2, 3
       ORDER BY "total_count" DESC, "tool" ASC`,
      [environment],
    ),
  ]);

  const startedAt = metadata.rows[0]?.logging_started_at as
    | Date
    | string
    | undefined;
  const totalCalls = counts.rows.reduce(
    (sum, row) => sum + Number(row.total_count),
    0,
  );
  const daysObserved = startedAt
    ? Math.max(
        0,
        (Date.now() - new Date(startedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : 0;

  console.log(
    JSON.stringify(
      {
        environment,
        loggingStartedAt: startedAt
          ? new Date(startedAt).toISOString()
          : null,
        totalCalls,
        daysObserved,
        ready: daysObserved >= 30 || totalCalls >= 500,
        thresholds: { days: 30, calls: 500 },
        byToolAndVersion: counts.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await analyticsPool.end();
}
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Pre-existing project table retained in the schema source so db:push never
// mistakes it for a rename or deletion when applying analytics changes.
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

/**
 * Privacy-minimal, durable tool-call analytics.
 *
 * This is intentionally the complete event shape: do not add request data,
 * payload data, identifiers, error detail, status, or duration here.
 */
export const toolOutcome = pgEnum("tool_outcome", ["success", "error"]);
export const toolErrorClass = pgEnum("tool_error_class", [
  "validation",
  "authentication",
  "authorization",
  "not_found",
  "conflict",
  "rate_limit",
  "timeout",
  "github_api",
  "internal",
  "unknown",
]);
export const toolEnvironment = pgEnum("tool_environment", [
  "development",
  "production",
]);

export const toolAnalyticsEvents = pgTable(
  "tool_analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    // Keep the legacy text column types migration-safe; all new writes are
    // capped before insert.
    tool: text("tool").notNull(),
    owner: text("owner"),
    repo: text("repo"),
    environment: toolEnvironment("environment")
      .default("production")
      .notNull(),
    connectorVersion: varchar("connector_version", { length: 64 })
      .default("legacy")
      .notNull(),
    outcome: toolOutcome("outcome").notNull(),
    errorClass: toolErrorClass("error_class").default("unknown"),
  },
  (table) => [
    index("tool_analytics_events_timestamp_idx").on(table.timestamp),
    check(
      "tool_analytics_events_error_class_check_v2",
      sql`(${table.outcome} = 'success' AND (${table.errorClass} IS NULL OR (${table.connectorVersion} = 'legacy' AND ${table.errorClass} = 'unknown'))) OR (${table.outcome} = 'error' AND ${table.errorClass} IS NOT NULL)`,
    ),
  ],
);

export const toolAnalyticsMetadata = pgTable("tool_analytics_metadata", {
  environment: toolEnvironment("environment").primaryKey(),
  loggingStartedAt: timestamp("logging_started_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  lastMaintenanceAt: timestamp("last_maintenance_at", {
    withTimezone: true,
    mode: "date",
  })
    .default(sql`to_timestamp(0)`)
    .notNull(),
});

export const toolAnalyticsMonthlyRollups = pgTable(
  "tool_analytics_monthly_rollups",
  {
    month: date("month").notNull(),
    tool: varchar("tool", { length: 64 }).notNull(),
    environment: toolEnvironment("environment").notNull(),
    connectorVersion: varchar("connector_version", { length: 64 }).notNull(),
    totalCount: bigint("total_count", { mode: "number" }).notNull(),
    successCount: bigint("success_count", { mode: "number" }).notNull(),
    errorCount: bigint("error_count", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.month,
        table.tool,
        table.environment,
        table.connectorVersion,
      ],
    }),
  ],
);
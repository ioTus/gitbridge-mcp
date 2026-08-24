import fs from "node:fs";
import path from "node:path";
import { analyticsPool } from "../db.js";
import type { ToolErrorClass } from "./tool-error-class.js";

export type ToolOutcome = "success" | "error";
export type ToolEnvironment = "development" | "production";

export interface PrivacyMinimalToolCallInput {
  tool: string;
  args?: unknown;
  outcome: ToolOutcome;
  errorClass?: ToolErrorClass;
}

export interface ToolAnalyticsQueryClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const defaultQueryClient: ToolAnalyticsQueryClient = {
  query: (text, values) => analyticsPool.query(text, values),
};

function readConnectorVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as { version?: unknown };
    if (typeof packageJson.version === "string") {
      return packageJson.version.slice(0, 64);
    }
  } catch {
    // The fallback remains stable and contains no request data.
  }
  return "unknown";
}

export const TOOL_ENVIRONMENT: ToolEnvironment =
  process.env.NODE_ENV === "production" ? "production" : "development";
export const CONNECTOR_VERSION = readConnectorVersion();
const PROCESS_STARTED_AT = new Date();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cappedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

export function extractOwnerRepo(args: unknown): {
  owner?: string;
  repo?: string;
} {
  if (!isRecord(args)) return {};
  const owner = cappedString(args.owner, 39);
  const repo = cappedString(args.repo, 100);
  return {
    ...(owner !== undefined ? { owner } : {}),
    ...(repo !== undefined ? { repo } : {}),
  };
}

export function normalizeAnalyticsEvent(input: PrivacyMinimalToolCallInput) {
  const { owner, repo } = extractOwnerRepo(input.args);
  return {
    tool: input.tool.slice(0, 64),
    owner: owner ?? null,
    repo: repo ?? null,
    environment: TOOL_ENVIRONMENT,
    connectorVersion: CONNECTOR_VERSION,
    outcome: input.outcome,
    errorClass:
      input.outcome === "error" ? input.errorClass ?? "unknown" : null,
  };
}

async function ensureMetadata(
  client: ToolAnalyticsQueryClient,
  environment: ToolEnvironment,
): Promise<void> {
  await client.query(
    `INSERT INTO "tool_analytics_metadata"
       ("environment", "logging_started_at", "last_maintenance_at")
     VALUES ($1, $2, TIMESTAMPTZ 'epoch')
     ON CONFLICT ("environment") DO NOTHING`,
    [environment, PROCESS_STARTED_AT],
  );
}

export async function initializeToolAnalytics(
  client: ToolAnalyticsQueryClient = defaultQueryClient,
): Promise<void> {
  try {
    await ensureMetadata(client, TOOL_ENVIRONMENT);
  } catch (error) {
    console.error("[ToolAnalytics] Initialization failed:", error);
  }
}

export async function runToolAnalyticsMaintenance(
  client: ToolAnalyticsQueryClient,
  environment: ToolEnvironment,
): Promise<void> {
  try {
    await client.query(
      `WITH maintenance_claim AS (
         UPDATE "tool_analytics_metadata"
         SET "last_maintenance_at" = NOW()
         WHERE "environment" = $1
           AND "last_maintenance_at" < NOW() - INTERVAL '24 hours'
         RETURNING "environment"
       ),
       expired AS (
         DELETE FROM "tool_analytics_events"
         WHERE "timestamp" < NOW() - INTERVAL '90 days'
           AND EXISTS (SELECT 1 FROM maintenance_claim)
         RETURNING "timestamp", "tool", "environment", "connector_version",
                   "outcome"
       ),
       aggregated AS (
         SELECT date_trunc('month', "timestamp")::date AS "month",
                LEFT("tool", 64) AS "tool", "environment", "connector_version",
                COUNT(*) AS "total_count",
                COUNT(*) FILTER (WHERE "outcome" = 'success') AS "success_count",
                COUNT(*) FILTER (WHERE "outcome" = 'error') AS "error_count"
         FROM expired
         GROUP BY 1, 2, 3, 4
       )
       INSERT INTO "tool_analytics_monthly_rollups"
         ("month", "tool", "environment", "connector_version",
          "total_count", "success_count", "error_count")
       SELECT "month", "tool", "environment", "connector_version",
              "total_count", "success_count", "error_count"
       FROM aggregated
       ON CONFLICT ("month", "tool", "environment", "connector_version")
       DO UPDATE SET
         "total_count" = "tool_analytics_monthly_rollups"."total_count" + EXCLUDED."total_count",
         "success_count" = "tool_analytics_monthly_rollups"."success_count" + EXCLUDED."success_count",
         "error_count" = "tool_analytics_monthly_rollups"."error_count" + EXCLUDED."error_count"`,
      [environment],
    );
  } catch (error) {
    console.error("[ToolAnalytics] Maintenance failed:", error);
  }
}

export async function persistToolAnalyticsEvent(
  input: PrivacyMinimalToolCallInput,
  client: ToolAnalyticsQueryClient = defaultQueryClient,
): Promise<void> {
  const event = normalizeAnalyticsEvent(input);
  try {
    await ensureMetadata(client, event.environment);
    await client.query(
      `INSERT INTO "tool_analytics_events"
         ("tool", "owner", "repo", "environment", "connector_version",
          "outcome", "error_class")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.tool,
        event.owner,
        event.repo,
        event.environment,
        event.connectorVersion,
        event.outcome,
        event.errorClass,
      ],
    );
    await runToolAnalyticsMaintenance(client, event.environment);
  } catch (error) {
    console.error("[ToolAnalytics] Failed to persist analytics event:", error);
  }
}
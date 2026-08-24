import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema.js";

export function connectionStringForEnvironment(
  value: string,
  environment = process.env.NODE_ENV,
): string {
  if (environment !== "production") return value;
  const url = new URL(value);
  url.searchParams.set("sslmode", "require");
  return url.toString();
}

/**
 * Shared PostgreSQL client. Constructing a Pool does not connect or mutate the
 * database; schema application remains the responsibility of Drizzle tooling.
 */
export const analyticsPool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: connectionStringForEnvironment(process.env.DATABASE_URL),
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
        max: 2,
      }
    : {
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
        max: 2,
      },
);

export const db = drizzle(analyticsPool, { schema });
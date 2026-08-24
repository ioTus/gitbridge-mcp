export const TOOL_ERROR_CLASSES = [
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
] as const;

export type ToolErrorClass = (typeof TOOL_ERROR_CLASSES)[number];

function statusFrom(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    status?: unknown;
    status_code?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [
    candidate.status,
    candidate.status_code,
    candidate.response?.status,
  ]) {
    if (typeof value === "number") return value;
  }
  return undefined;
}

function messageFrom(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "").toLowerCase();
  }
  return "";
}

export function classifyToolError(error: unknown): ToolErrorClass {
  const status = statusFrom(error);
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status !== undefined && status >= 500) return "github_api";

  const message = messageFrom(error);
  if (/timed? ?out|timeout|etimedout|econnreset/.test(message)) return "timeout";
  if (/sha|conflict|stale|does not match/.test(message)) return "conflict";
  if (/rate.?limit|too many requests/.test(message)) return "rate_limit";
  if (/unauthenticated|invalid token|bad credentials/.test(message)) {
    return "authentication";
  }
  if (/forbidden|permission|not authorized/.test(message)) return "authorization";
  if (/not found|does not exist/.test(message)) return "not_found";
  if (/invalid|required|must be|validation/.test(message)) return "validation";
  return "unknown";
}
import fs from "fs";
import path from "path";
import { redactToolArgs } from "./tool-log-redaction.js";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "tools.log");
const LOG_FILE_BACKUP = path.join(LOG_DIR, "tools.log.1");
const MAX_LOG_BYTES = 5 * 1024 * 1024;

let initialized = false;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", { mode: 0o600 });
  }
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= MAX_LOG_BYTES) {
      if (fs.existsSync(LOG_FILE_BACKUP)) fs.unlinkSync(LOG_FILE_BACKUP);
      fs.renameSync(LOG_FILE, LOG_FILE_BACKUP);
      fs.writeFileSync(LOG_FILE, "", { mode: 0o600 });
    }
  } catch {
    /* swallow */
  }
}

export interface ToolCallLogEntry {
  ts: string;
  tool: string;
  outcome: "success" | "error";
  duration_ms: number;
  args?: Record<string, unknown>;
  session?: string;
  request_id?: string;
  error_reason?: string;
  status_code?: number;
}

export interface PersistToolCallInput {
  tool: string;
  args?: unknown;
  outcome: "success" | "error";
  duration_ms: number;
  session?: string;
  request_id?: string;
  error_reason?: string;
  status_code?: number;
}

export function persistToolCall(input: PersistToolCallInput): void {
  try {
    if (!initialized) {
      ensureLogDir();
      initialized = true;
    }
    rotateIfNeeded();

    const entry: ToolCallLogEntry = {
      ts: new Date().toISOString(),
      tool: input.tool,
      outcome: input.outcome,
      duration_ms: input.duration_ms,
      args: redactToolArgs(input.tool, input.args),
    };
    if (input.session) entry.session = input.session;
    if (input.request_id) entry.request_id = input.request_id;
    if (input.error_reason)
      entry.error_reason = String(input.error_reason).slice(0, 200);
    if (typeof input.status_code === "number")
      entry.status_code = input.status_code;

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", {
      mode: 0o600,
    });
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ToolLog] Failed to persist tool call:`,
      err,
    );
  }
}

function readAllLines(filePath: string): string[] {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    if (!text) return [];
    return text.split("\n").filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function readLastLines(filePath: string, maxBytes: number): string[] {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    if (size === 0) return [];
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buf = Buffer.alloc(length);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buf, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }
    let text = buf.toString("utf8");
    if (start > 0) {
      const nl = text.indexOf("\n");
      if (nl >= 0) text = text.slice(nl + 1);
    }
    return text.split("\n").filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

export function getRecentToolCalls(limit: number = 10): ToolCallLogEntry[] {
  const READ_BYTES = 256 * 1024;
  const lines: string[] = [];
  if (fs.existsSync(LOG_FILE_BACKUP))
    lines.push(...readLastLines(LOG_FILE_BACKUP, READ_BYTES));
  if (fs.existsSync(LOG_FILE))
    lines.push(...readLastLines(LOG_FILE, READ_BYTES));

  const out: ToolCallLogEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const obj = JSON.parse(lines[i]) as ToolCallLogEntry;
      if (obj && obj.tool && obj.ts) out.push(obj);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export interface ToolCallQuery {
  sinceMs: number;
  untilMs?: number;
  tools?: Set<string>;
  outcome?: "success" | "error";
  limit?: number;
}

export function getToolCallsInRange(q: ToolCallQuery): ToolCallLogEntry[] {
  const untilMs = q.untilMs ?? Date.now();
  const limit = q.limit ?? 5000;

  const lines: string[] = [];
  if (fs.existsSync(LOG_FILE_BACKUP))
    lines.push(...readAllLines(LOG_FILE_BACKUP));
  if (fs.existsSync(LOG_FILE)) lines.push(...readAllLines(LOG_FILE));

  const out: ToolCallLogEntry[] = [];
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    try {
      const obj = JSON.parse(lines[i]) as ToolCallLogEntry;
      if (!obj || !obj.tool || !obj.ts) continue;
      const ts = Date.parse(obj.ts);
      if (Number.isNaN(ts) || ts < q.sinceMs || ts > untilMs) continue;
      if (q.tools && !q.tools.has(obj.tool)) continue;
      if (q.outcome && obj.outcome !== q.outcome) continue;
      out.push(obj);
    } catch {
      /* skip */
    }
  }
  return out;
}

ensureLogDir();
initialized = true;

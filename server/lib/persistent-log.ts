import fs from "fs";
import path from "path";
import { createHmac } from "crypto";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "auth.log");
const LOG_FILE_BACKUP = path.join(LOG_DIR, "auth.log.1");
const MAX_BYTES = 5 * 1024 * 1024;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", { mode: 0o600 });
  }
}

function rotatIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= MAX_BYTES) {
      if (fs.existsSync(LOG_FILE_BACKUP)) {
        fs.unlinkSync(LOG_FILE_BACKUP);
      }
      fs.renameSync(LOG_FILE, LOG_FILE_BACKUP);
      fs.writeFileSync(LOG_FILE, "", { mode: 0o600 });
    }
  } catch {
  }
}

function hashIp(ip: string): string {
  const daySalt = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", daySalt).update(ip).digest("hex").slice(0, 12);
}

export type PersistentLogEvent =
  | "SERVER_START"
  | "TOKEN_ISSUED"
  | "REFRESH_ISSUED"
  | "AUTH_REJECTED"
  | "REFRESH_REJECTED"
  | "SESSION_START"
  | "SESSION_CLOSE"
  | "SESSION_EVICTED"
  | "SESSION_REBOUND"
  | "REFRESH_TOKEN_LOADED"
  | "REFRESH_TOKEN_LOAD_ALERT"
  | "REFRESH_TOKEN_ALERT_NOTIFIED";

export interface PersistentLogEntry {
  ts: string;
  event: PersistentLogEvent;
  grant?: string;
  client?: string;
  method?: string;
  path?: string;
  reason?: string;
  session?: string;
  old_session?: string;
  new_session?: string;
  ip_hash?: string;
  idle_ms?: number;
  count?: number;
  dropped_expired?: number;
  dropped_malformed?: number;
  previous_count?: number;
}

let initialized = false;

export function persistLog(entry: PersistentLogEntry): void {
  try {
    if (!initialized) {
      ensureLogDir();
      initialized = true;
    }
    rotatIfNeeded();
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n";
    fs.appendFileSync(LOG_FILE, line, { mode: 0o600 });
  } catch (err) {
    console.error(`[PersistentLog] Failed to write log entry:`, err);
  }
}

export function persistLogWithIp(entry: PersistentLogEntry, rawIp: string): void {
  persistLog({ ...entry, ip_hash: hashIp(rawIp || "unknown") });
}

export interface SessionEventSummary {
  ts: string;
  event: "SESSION_START" | "SESSION_EVICTED" | "SESSION_CLOSE" | "SESSION_REBOUND";
  session?: string;
  old_session?: string;
  new_session?: string;
  reason?: string;
  idle_ms?: number;
}

export type TokenEventType =
  | "TOKEN_ISSUED"
  | "REFRESH_ISSUED"
  | "REFRESH_REJECTED"
  | "AUTH_REJECTED";

export interface TokenEventSummary {
  ts: string;
  event: TokenEventType;
  grant?: string;
  reason?: string;
  client?: string;
  ip_hash?: string;
  method?: string;
  path?: string;
}

export interface TokenEventCounts {
  issuedLastHour: number;
  rejectedLastHour: number;
}

const SESSION_EVENT_SET = new Set<PersistentLogEvent>([
  "SESSION_START",
  "SESSION_EVICTED",
  "SESSION_CLOSE",
  "SESSION_REBOUND",
]);

const TOKEN_EVENT_SET = new Set<PersistentLogEvent>([
  "TOKEN_ISSUED",
  "REFRESH_ISSUED",
  "REFRESH_REJECTED",
  "AUTH_REJECTED",
]);

const ISSUED_EVENT_SET = new Set<PersistentLogEvent>([
  "TOKEN_ISSUED",
  "REFRESH_ISSUED",
]);

const REJECTED_EVENT_SET = new Set<PersistentLogEvent>([
  "REFRESH_REJECTED",
  "AUTH_REJECTED",
]);

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

function readRecentLines(): string[] {
  const READ_BYTES = 256 * 1024;
  const lines: string[] = [];
  if (fs.existsSync(LOG_FILE_BACKUP)) {
    lines.push(...readLastLines(LOG_FILE_BACKUP, READ_BYTES));
  }
  if (fs.existsSync(LOG_FILE)) {
    lines.push(...readLastLines(LOG_FILE, READ_BYTES));
  }
  return lines;
}

export function getRecentSessionEvents(limit: number = 10): SessionEventSummary[] {
  const lines = readRecentLines();

  const events: SessionEventSummary[] = [];
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    try {
      const obj = JSON.parse(lines[i]) as PersistentLogEntry;
      if (!obj || !obj.event) continue;
      if (!SESSION_EVENT_SET.has(obj.event)) continue;
      events.push({
        ts: obj.ts,
        event: obj.event as SessionEventSummary["event"],
        session: obj.session ?? obj.new_session,
        old_session: obj.old_session,
        new_session: obj.new_session,
        reason: obj.reason,
        idle_ms: obj.idle_ms,
      });
    } catch {
    }
  }
  return events;
}

export function getRecentTokenEvents(limit: number = 10): TokenEventSummary[] {
  const lines = readRecentLines();

  const events: TokenEventSummary[] = [];
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    try {
      const obj = JSON.parse(lines[i]) as PersistentLogEntry;
      if (!obj || !obj.event) continue;
      if (!TOKEN_EVENT_SET.has(obj.event)) continue;
      events.push({
        ts: obj.ts,
        event: obj.event as TokenEventType,
        grant: obj.grant,
        reason: obj.reason,
        client: obj.client,
        ip_hash: obj.ip_hash,
        method: obj.method,
        path: obj.path,
      });
    } catch {
    }
  }
  return events;
}

export function getTokenEventCounts(windowMs: number = 60 * 60 * 1000): TokenEventCounts {
  const lines = readRecentLines();
  const cutoff = Date.now() - windowMs;
  let issued = 0;
  let rejected = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]) as PersistentLogEntry;
      if (!obj || !obj.event || !obj.ts) continue;
      if (!TOKEN_EVENT_SET.has(obj.event)) continue;
      const ts = Date.parse(obj.ts);
      if (Number.isNaN(ts)) continue;
      if (ts < cutoff) continue;
      if (ISSUED_EVENT_SET.has(obj.event)) issued++;
      else if (REJECTED_EVENT_SET.has(obj.event)) rejected++;
    } catch {
    }
  }

  return { issuedLastHour: issued, rejectedLastHour: rejected };
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

export function getEventsForSession(
  sessionId: string,
  limit: number = 100,
): SessionEventSummary[] {
  if (!sessionId) return [];
  const lines: string[] = [];
  if (fs.existsSync(LOG_FILE_BACKUP)) {
    lines.push(...readAllLines(LOG_FILE_BACKUP));
  }
  if (fs.existsSync(LOG_FILE)) {
    lines.push(...readAllLines(LOG_FILE));
  }

  const events: SessionEventSummary[] = [];
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    try {
      const obj = JSON.parse(lines[i]) as PersistentLogEntry;
      if (!obj || !obj.event) continue;
      if (!SESSION_EVENT_SET.has(obj.event)) continue;
      const matches =
        obj.session === sessionId ||
        obj.old_session === sessionId ||
        obj.new_session === sessionId;
      if (!matches) continue;
      events.push({
        ts: obj.ts,
        event: obj.event as SessionEventSummary["event"],
        session: obj.session ?? obj.new_session,
        old_session: obj.old_session,
        new_session: obj.new_session,
        reason: obj.reason,
        idle_ms: obj.idle_ms,
      });
    } catch {
    }
  }
  return events;
}

ensureLogDir();

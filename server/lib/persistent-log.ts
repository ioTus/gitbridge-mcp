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
  | "SESSION_CLOSE";

export interface PersistentLogEntry {
  ts: string;
  event: PersistentLogEvent;
  grant?: string;
  client?: string;
  method?: string;
  path?: string;
  reason?: string;
  session?: string;
  ip_hash?: string;
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

ensureLogDir();

import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import * as fs from "fs";

export type LoginProvider =
  | "anthropic"
  | "openai"
  | "nvidia-nim"
  | "groq"
  | "together"
  | "ollama";

export type LoginSessionConfig = {
  provider: LoginProvider;
  model: string;
  apiKey: string;
};

export type LoginSessionRecord = {
  token: string;
  createdAt: number;
  status: "pending" | "completed";
  config?: LoginSessionConfig;
};

const SESSION_DIR = join(homedir(), ".santra", "login-sessions");

function ensureDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function getSessionPath(token: string) {
  return join(SESSION_DIR, `${token}.json`);
}

export function createLoginSession(token = randomUUID()): LoginSessionRecord {
  ensureDir();
  const record: LoginSessionRecord = {
    token,
    createdAt: Date.now(),
    status: "pending",
  };
  fs.writeFileSync(getSessionPath(token), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

export function readLoginSession(token: string): LoginSessionRecord | null {
  try {
    const raw = fs.readFileSync(getSessionPath(token), "utf-8");
    return JSON.parse(raw) as LoginSessionRecord;
  } catch {
    return null;
  }
}

export function completeLoginSession(
  token: string,
  config: LoginSessionConfig,
): LoginSessionRecord | null {
  const current = readLoginSession(token);
  if (!current) return null;
  const next: LoginSessionRecord = {
    ...current,
    status: "completed",
    config,
  };
  fs.writeFileSync(getSessionPath(token), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function consumeCompletedLoginSession(
  token: string,
): LoginSessionRecord | null {
  const current = readLoginSession(token);
  if (!current || current.status !== "completed" || !current.config) return null;
  try {
    fs.unlinkSync(getSessionPath(token));
  } catch {
    // ignore cleanup errors
  }
  return current;
}

export function buildLoginUrl(token: string): string {
  const base = process.env["SANTRA_LOGIN_URL"] ?? "http://localhost:3000/login";
  return `${base.replace(/\/$/, "")}/${token}`;
}

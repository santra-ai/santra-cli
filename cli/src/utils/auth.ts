import { join } from "path";
import { getSantraHome } from "./santra-home";

export type AuthProvider = "github" | "google";

export type AuthState = {
  version: 1;
  provider: AuthProvider;
  authenticatedAt: number;
};

const AUTH_DIR = getSantraHome();
const AUTH_PATH = join(AUTH_DIR, "auth.json");

export function authExists(): boolean {
  try {
    const fs = require("fs") as typeof import("fs");
    return fs.existsSync(AUTH_PATH);
  } catch {
    return false;
  }
}

export function readAuthState(): AuthState | null {
  try {
    const fs = require("fs") as typeof import("fs");
    const raw = fs.readFileSync(AUTH_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (
      parsed.version !== 1 ||
      (parsed.provider !== "github" && parsed.provider !== "google") ||
      typeof parsed.authenticatedAt !== "number"
    ) {
      return null;
    }
    return parsed as AuthState;
  } catch {
    return null;
  }
}

export function writeAuthState(state: AuthState): void {
  const fs = require("fs") as typeof import("fs");
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(state, null, 2), "utf-8");
}

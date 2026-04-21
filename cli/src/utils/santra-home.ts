import { homedir } from "node:os";
import { join } from "node:path";

export const SANTRA_HOME_ENV = "SANTRA_HOME";

export function getSantraHome(): string {
  return process.env[SANTRA_HOME_ENV] || join(homedir(), ".santra");
}

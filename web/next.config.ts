import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// In this monorepo, secrets live in the repository root .env.
// Preload root env so server routes can read them from process.env.
const projectDir = process.cwd();
const monorepoRoot = path.resolve(projectDir, "..");
const rootEnvPath = path.join(monorepoRoot, ".env");

// Load root-level .env values into process.env when they are not already set.
function loadRootEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    if ((isSingleQuoted || isDoubleQuoted) && value.length >= 2) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadRootEnv(rootEnvPath);

const nextConfig: NextConfig = {};

export default nextConfig;

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MANAGED_BLOCK_START = "# >>> Santra CLI managed block >>>";
const MANAGED_BLOCK_END = "# <<< Santra CLI managed block <<<";
const MANAGED_BLOCK = [
  MANAGED_BLOCK_START,
  "# Ensure the globally installed `santra` command is available in this shell.",
  'export SANTRA_HOME="$HOME/.santra"',
  "if command -v npm >/dev/null 2>&1; then",
  '  export PATH="$(npm prefix -g 2>/dev/null)/bin:$PATH"',
  "fi",
  MANAGED_BLOCK_END,
].join("\n");

function getProfilePaths() {
  const home = os.homedir();
  return [path.join(home, ".zshrc"), path.join(home, ".bashrc")];
}

function upsertManagedBlock(filePath) {
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";

  if (current.includes(MANAGED_BLOCK_START)) {
    return { filePath, changed: false };
  }

  const next = current
    ? `${current.trimEnd()}\n\n${MANAGED_BLOCK}\n`
    : `${MANAGED_BLOCK}\n`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, "utf8");

  return { filePath, changed: true };
}

function shellRcHint() {
  const shell = process.env.SHELL || "";
  return shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";
}

console.log("");
console.log("\x1b[32m%s\x1b[0m", "Santra CLI installed successfully!");

if (process.env.SANTRA_SKIP_SHELL_SETUP === "1") {
  console.log("Skipped automatic PATH setup (SANTRA_SKIP_SHELL_SETUP=1).");
  console.log("Run this to configure manually:");
  console.log("  \x1b[36m%s\x1b[0m", "npx santra --install-shell");
  console.log("");
  process.exit(0);
}

try {
  const results = getProfilePaths().map(upsertManagedBlock);

  for (const result of results) {
    const status = result.changed ? "updated" : "already configured";
    console.log(`${status}: ${result.filePath}`);
  }

  console.log(
    `PATH setup complete. Run 'source ${shellRcHint()}' (or restart your terminal).`,
  );
  console.log(
    "If 'santra' is still not found, run: npx santra --install-shell",
  );
  console.log("");
} catch (error) {
  console.log("Automatic PATH setup could not be completed.");
  console.log("Run this to configure manually:");
  console.log("  \x1b[36m%s\x1b[0m", "npx santra --install-shell");
  console.log("");
}

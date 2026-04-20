import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MANAGED_BLOCK_START = "# >>> Santra CLI managed block >>>";
const MANAGED_BLOCK_END = "# <<< Santra CLI managed block <<<";

const MANAGED_BLOCK = [
  MANAGED_BLOCK_START,
  '# Ensure the globally installed `santra` command is available in this shell.',
  'export SANTRA_HOME="$HOME/.santra"',
  'if command -v npm >/dev/null 2>&1; then',
  '  export PATH="$(npm prefix -g 2>/dev/null)/bin:$PATH"',
  "fi",
  MANAGED_BLOCK_END,
].join("\n");

export type ShellProfileInstallResult = {
  filePath: string;
  changed: boolean;
};

function getProfilePaths(): string[] {
  const home = os.homedir();
  return [path.join(home, ".zshrc"), path.join(home, ".bashrc")];
}

function upsertManagedBlock(filePath: string): ShellProfileInstallResult {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

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

export function installShellProfile(dryRun = false): ShellProfileInstallResult[] {
  const results: ShellProfileInstallResult[] = [];

  for (const filePath of getProfilePaths()) {
    if (dryRun) {
      const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
      results.push({
        filePath,
        changed: !current.includes(MANAGED_BLOCK_START),
      });
      continue;
    }

    results.push(upsertManagedBlock(filePath));
  }

  return results;
}

export function getManagedShellBlock(): string {
  return MANAGED_BLOCK;
}
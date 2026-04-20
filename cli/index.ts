import { render } from "ink";
import { createElement } from "react";
import { App } from "./src/tui_v4/App";
import { installShellProfile } from "./src/utils/shell-profile";

type Command = "install-shell" | "--install-shell" | "-i";

function isInstallCommand(value: string | undefined): value is Command {
  return (
    value === "install-shell" || value === "--install-shell" || value === "-i"
  );
}

function printUsage(): void {
  console.log("Usage: santra [install-shell|--install-shell|-i]");
}

function runInstallShell(): void {
  const dryRun =
    process.argv.includes("--dry-run") || process.argv.includes("-n");
  const results = installShellProfile(dryRun);

  for (const result of results) {
    const status = result.changed
      ? dryRun
        ? "would update"
        : "updated"
      : "already configured";
    console.log(`${status}: ${result.filePath}`);
  }

  console.log(
    dryRun
      ? "Dry run complete. Restart your shell after applying the changes manually."
      : "Shell profile updated. Restart your shell, then run `santra` from any repo.",
  );
}

const [command] = process.argv.slice(2);

if (command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

if (isInstallCommand(command)) {
  runInstallShell();
  process.exit(0);
}

render(createElement(App), { incrementalRendering: true, maxFps: 60 });

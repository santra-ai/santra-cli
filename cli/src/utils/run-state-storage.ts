import path from "path";
import * as os from "os";
import * as fs from "fs";

import type { RunState } from "@santra/shared";
import type { SessionState } from "../types/session-state";

const APP_NAME = "santra";
const PROJECT_NAME = path.basename(process.cwd());
const CONFIG_DIR = path.join(os.homedir(), ".config");
export const RUN_STATE_FILENAME = "run-state.json";

// Make sure the target directory exists before reading or writing files in it.
function ensureDirectoryExistence(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

// Create a filesystem-safe chat id from current timestamp.
export function createChatId() {
  return new Date().toISOString().replace(/:/g, "-");
}

// Build and create the folder where one chat run-state file is stored.
export function getRunStateDirectoryPath(chatId: string) {
  const dir = path.join(
    CONFIG_DIR,
    APP_NAME,
    "projects",
    PROJECT_NAME,
    "chats",
    chatId,
  );

  ensureDirectoryExistence(dir);

  return dir;
}

/**
 * Save RunState to disk
 * eg. /Users/sagarmandal/.config/santra/projects/santra-cli/chats/2026-04-07T11-07-07.641Z/run-state.json
 */
// Persist the current run state so the same chat can be resumed later.
export function saveRunState({
  state,
  chatId,
}: {
  state: RunState;
  chatId: string;
}) {
  try {
    const runStateDirectoryPath = getRunStateDirectoryPath(chatId);
    const sessionState: SessionState = {
      mainAgentState: {
        messageHistory: state.messages,
      },
    };
    const runStateFilePath = path.join(
      runStateDirectoryPath,
      RUN_STATE_FILENAME,
    );

    fs.writeFileSync(runStateFilePath, JSON.stringify(sessionState, null, 2));
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
    else console.error(String(error));
  }
}

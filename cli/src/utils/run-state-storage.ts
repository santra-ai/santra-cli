import path from "path";
import * as os from "os";
import * as fs from "fs";

import type { RunState } from "@santra/shared";
import type { SessionState } from "../types/session-state";

const APP_NAME = "santra";
const PROJECT_NAME = path.basename(process.cwd());
const CONFIG_DIR = path.join(os.homedir(), ".config");
export const RUN_STATE_FILENAME = "run-state.json";

function ensureDirectoryExistence(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function createChatId() {
  return new Date().toISOString().replace(/:/g, "-");
}

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
    console.log(`Saving run state to ${runStateDirectoryPath}`);
    fs.writeFileSync(runStateFilePath, JSON.stringify(sessionState, null, 2));
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
    else console.error(String(error));
  }
}

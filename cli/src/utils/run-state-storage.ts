import path from "path";
import * as os from "os";
import * as fs from "fs";

import type { RunState } from "@santra/shared";
import type { SessionState } from "../types/session-state";

export type StoredChatSummary = {
  chatId: string;
  updatedAt: number;
  preview: string;
};

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

function getChatsDirectoryPath() {
  return path.join(CONFIG_DIR, APP_NAME, "projects", PROJECT_NAME, "chats");
}

function getPreviewText(sessionState: SessionState): string {
  const lastVisibleMessage = [...sessionState.mainAgentState.messageHistory]
    .reverse()
    .find((message) => message.role != "system");

  if (!lastVisibleMessage) return "Emtpy session";

  const text = lastVisibleMessage.content.replace(/\s+/g, " ").trim();

  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

export function listSavedChats(): StoredChatSummary[] {
  const chatsDir = getChatsDirectoryPath();
  console.log("looking for saved chats in:", chatsDir, fs.existsSync(chatsDir));
  if (!fs.existsSync(chatsDir)) return [];
  const savedChats = fs
    .readdirSync(chatsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory)
    .map((entry) => {
      console.log(entry);
      const chatId = entry.name;
      const runStateFilePath = path.join(
        getRunStateDirectoryPath(chatId),
        RUN_STATE_FILENAME,
      );

      if (!fs.existsSync(runStateFilePath)) return null;

      const raw = fs.readFileSync(runStateFilePath, "utf-8");
      const sessionState = JSON.parse(raw) as SessionState;
      const stat = fs.statSync(runStateFilePath);

      return {
        chatId,
        updatedAt: stat.mtimeMs,
        preview: getPreviewText(sessionState),
      };
    })
    .filter((chat) => chat != null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  console.log("saved chats:", savedChats);
  return savedChats;
}

export function loadRunState(chatId: string): RunState | undefined {
  try {
    const runStateFilePath = path.join(
      getRunStateDirectoryPath(chatId),
      RUN_STATE_FILENAME,
    );

    const raw = fs.readFileSync(runStateFilePath, "utf-8");
    const sessionState = JSON.parse(raw) as SessionState;

    return {
      messages: sessionState.mainAgentState.messageHistory,
      output: { type: "lastMessage", content: [] },
    };
  } catch {
    return undefined;
  }
}

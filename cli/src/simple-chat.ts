import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { RunState } from "@santra/shared";
import { Client } from "./client";
import {
  createChatId,
  getRunStateDirectoryPath,
  RUN_STATE_FILENAME,
  saveRunState,
} from "./utils/run-state-storage";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SessionState } from "./types/session-state";

const rl = readline.createInterface({
  input,
  output,
});

// 1. on every new start it create chat directory run-state.json persistence only
// 2. on every iteration it should append the history to run-state.json then onward

function shouldExit(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "exit" || normalized === "quit";
}

const client = new Client();

let state: RunState | undefined;

const isExitingChat = process.argv.slice(2).length > 0;
const chatId = isExitingChat ? process.argv.slice(2)[0]! : createChatId();
// create directory + run-state.json in it using that chat id
const runStateDirectoryPath = getRunStateDirectoryPath(chatId);

if (isExitingChat) {
  console.log("Using Existing Chat");
  const raw = readFileSync(
    path.join(runStateDirectoryPath, RUN_STATE_FILENAME),
    "utf-8",
  );
  const parsedSessionState = JSON.parse(raw) as SessionState;
  state = {
    messages: parsedSessionState.mainAgentState.messageHistory,
    output: { type: "lastMessage", content: [] },
  };
}

while (true) {
  const prompt = (await rl.question("You: ")).trim();

  if (!prompt) continue;

  if (shouldExit(prompt)) break;

  process.stdout.write("Agent: ");

  try {
    state = await client.run({
      prompt,
      previousState: state,
    });
    saveRunState({ chatId, state });

    if (state.output.type === "error")
      console.error(`\n[chat] Error: ${state.output.message}`);
  } catch (error) {
    console.error(
      `\n[chat] Fatal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

import { Client } from "./src/client.ts";
import type { RunState } from "@santra/shared";

// taking input and argv

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error("Usage: bun cli/src/index.ts <your prompt here>");
  process.exit(1);
}

// run function calling

const client = new Client();

console.log(`\nYou: ${prompt}`);
process.stdout.write("Agent: ");

let state: RunState;
let streamed = "";

try {
  state = await client.run({
    prompt,
    onDelta: (chunk) => {
      streamed += chunk;
      process.stdout.write(chunk);
    },
  });
} catch (err) {
  console.error(
    `\n[cli] Fatal: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

if (state.output.type === "error") {
  console.error(`[cli] Error: ${state.output.message}`);
  process.exit(1);
}

if (state.output.type === "text" && state.output.content !== streamed) {
  process.stdout.write(state.output.content);
}

process.stdout.write("\n");

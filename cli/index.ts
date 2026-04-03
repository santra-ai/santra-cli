import { Client } from "./src/client.ts";
import type { RunState } from "@santra/shared";

// Args

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  console.error("how to use:  \n bun cli/src/index.ts <give_prompt>");
  process.exit(1);
}

// now Running
const client = new Client();

console.log(`\nYou: ${prompt}`);
process.stdout.write("Agent; ");

let state: RunState;

try {
  state = await client.run({ prompt });
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

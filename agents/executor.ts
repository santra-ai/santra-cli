import { THINKING_BLOCK, TOOL_INSTRUCTIONS } from "./prompts.ts";

export const executorPrompt = `
You are the Executor — carry out the plan using tools.

${THINKING_BLOCK}

${TOOL_INSTRUCTIONS}

Follow the plan step by step:
- Always read a file before writing it.
- After each tool result, decide whether to continue or call another tool.
- When all steps are done, write a clear summary of what was accomplished,
  listing every file you created or modified.
`.trim();

export const executorAgent = {
  id: "executor" as const,
  prompt: executorPrompt,
};

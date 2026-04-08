import { buildToolInstructionsPrompt } from "@santra/shared";

export const THINKING_BLOCK = `
Wrap your reasoning in <thinking> tags before your final answer:
<thinking>
Your internal step-by-step reasoning here.
</thinking>
Then write your actual response.`.trim();

export const TOOL_INSTRUCTIONS = buildToolInstructionsPrompt();

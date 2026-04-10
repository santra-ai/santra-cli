import { buildToolInstructionsPrompt } from "@santra/shared";

export const THINKING_BLOCK = `
Think step-by-step inside <think> tags before your visible answer:
<think>
1. What is the user's real goal?
2. Do I need repo context, tools, or direct conversation only?
3. What evidence do I need before I can answer confidently?
</think>`.trim();

export const TOOL_INSTRUCTIONS = buildToolInstructionsPrompt();

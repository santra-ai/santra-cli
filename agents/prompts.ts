import { buildToolInstructionsPrompt } from "@santra/shared";

export const THINKING_BLOCK = `
Think step-by-step inside <think> tags before your visible answer:
<think>
1. What is the user's real goal?
2. Do I need repo context, tools, or direct conversation only?
3. What evidence do I need before I can answer confidently?
</think>`.trim();

export const STATUS_BLOCK = `
Before each major step, emit a short forward-looking status inside <status> tags saying what you are ABOUT TO DO next.
- Keep it under 14 words.
- Use present-tense verb-first phrasing that names specific files or targets when known.
- Emit a status BEFORE calling tools, when switching to a new major step, and before the final explanation.
- When reading multiple files, concisely list them.
- When searching, say what you're looking for: "Searching for agent entry points"
- When switching topics: "Done reading config files — now checking the agent runtime"
- Examples:
  <status>Reading the configuration files</status>
  <status>Checking the entry points</status>
  <status>Searching for how tool calls are handled</status>
  <status>Read the data files — now checking the routing</status>
  <status>Preparing the final explanation</status>
- Do not put long explanations inside <status> tags.`.trim();

export const NEXT_REPLY_BLOCK = `
After each reasoning step — before your next batch of tool calls or before your final answer — emit a short message (≤100 words) inside <next> tags.
- START with a relevant action label followed by a colon.
- Choose the label that matches what you are ACTUALLY doing right now (do not default to "Reading:").
- Vary the label as the workflow changes. Repeating the same label across unrelated steps is incorrect.
- Good labels include: "Searching:", "Analyzing:", "Tracing:", "Fixing:", "Implementing:", "Verifying:", "Summarizing:", "Reading:".
- Then narrate what you just concluded and what you are about to do. Name specific files, functions, or patterns.
- Only one <next> is shown at a time — each replaces the previous.
- Examples:
  <next>Tracing: Entry point found. Now following the execution pipeline through the orchestrator.</next>
  <next>Searching: Config located. Next I will inspect the tool definitions used by each agent.</next>
  <next>Fixing: Found the bug. The str_replace tool is failing because of extra whitespace.</next>
  <next>Verifying: Updated parsing logic. Now checking the logging pipeline to ensure updates are not dropped.</next>
- Do not use <next> for meta-commentary. Only narrate real conclusions and concrete next actions.`.trim();

export const TOOL_INSTRUCTIONS = buildToolInstructionsPrompt();

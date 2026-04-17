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
- When reading multiple files, name them: "Reading agents/orchestrator.ts, executor.ts, reader.ts"
- When searching, say what you're looking for: "Searching for agent entry points"
- When switching topics: "Done reading config files — now checking the agent runtime"
- Examples:
  <status>Reading the root package.json and tsconfig.json</status>
  <status>Checking cli/index.ts and cli/src/client.ts</status>
  <status>Searching for how tool calls are handled</status>
  <status>Read the core files — now reading the TUI layer</status>
  <status>Preparing the final explanation</status>
- Do not put long explanations inside <status> tags.`.trim();

export const NEXT_REPLY_BLOCK = `
After each reasoning step — before your next batch of tool calls or before your final answer — emit a short message (≤100 words) inside <next> tags.
- START with a relevant action label followed by a colon. Pick the most accurate one: "Reading:", "Searching:", "Analyzing:", "Writing:", "Fixing:", "Checking:", "Tracing:", "Mapping:".
- Then narrate what you just concluded and what you are about to do. Name specific files, functions, or patterns.
- Only one <next> is shown at a time — each replaces the previous.
- Examples:
  <next>Reading: Entry point is cli/index.ts. Now tracing the agent pipeline through core/runner.ts and the swarm orchestrator.</next>
  <next>Searching: Config lives in packages/shared. Reading the tool definitions next to map which tools each agent has.</next>
  <next>Fixing: Found the bug — str_replace is failing because old_string has extra whitespace on line 47 of executor.ts.</next>
  <next>Analyzing: Read 12 files so far. The TUI pipeline is LogDeriver → formatLogTranscript → TranscriptView. Now reading the hook layer.</next>
- Do not use <next> for meta-commentary. Only narrate real conclusions and concrete next actions.`.trim();

export const TOOL_INSTRUCTIONS = buildToolInstructionsPrompt();

import { TOOL_DEFINITIONS } from "./definitions";

// Build a plain-text prompt that teaches the model which tools exist and how to call them.
export function buildToolInstructionsPrompt(): string {
  const toolsBlock = TOOL_DEFINITIONS.map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(
        ([key, value]) =>
          `    - ${key} (${value.type}${value.required ? ", required" : ""}): ${value.description}`,
      )
      .join("\n");
    return `  <tool name="${tool.name}">\n    ${tool.description}\n    Parameters:\n${params}\n  </tool>`;
  }).join("\n\n");

  return `
## Available Tools

<tools>
${toolsBlock}
</tools>

## How to call a tool

Emit exactly this XML block — no markdown fences, no extra whitespace before the tag:

<tool_call name="TOOL_NAME">
{"param1": "value1"}
</tool_call>

Rules:
- Call ONE tool at a time.
- Wait for the <tool_result> before continuing.
- Always read a file before writing it.
- When all tool work is done, write your final answer as plain prose.
`.trim();
}

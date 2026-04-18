import { TOOL_DEFINITIONS } from "./definitions";
import type { ToolName } from "../types/types.ts";

// Build a plain-text prompt that teaches the model which tools exist and how to call them.
export function buildToolInstructionsPrompt(toolNames?: ToolName[]): string {
  const tools = toolNames?.length
    ? TOOL_DEFINITIONS.filter((tool) => toolNames.includes(tool.name))
    : TOOL_DEFINITIONS;

  const toolsBlock = tools.map((tool) => {
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

To call a tool, emit EXACTLY this XML block. No markdown fences, no backticks, no extra spaces before the opening tag:

<tool_call name="TOOL_NAME">
{"param1": "value1", "param2": "value2"}
</tool_call>

The tool result will be returned to you as:
<tool_result name="TOOL_NAME" id="...">
{"key": "value", ...}
</tool_result>

After receiving a tool_result, decide what to do next — call another tool or write your final response.
Before each major step, you may emit a short <status>...</status> line that says what you are about to do.
When you change from one major step to another, emit a new <status> first.

## Concrete Examples

### Example: Read a file
<status>Reading package metadata</status>
<tool_call name="read_file">
{"path": "package.json"}
</tool_call>

### Example: List a directory
<status>Inspecting the root folder</status>
<tool_call name="list_directory">
{"path": "."}
</tool_call>

### Example: List a subdirectory
<tool_call name="list_directory">
{"path": "src/agents"}
</tool_call>

### Example: Search for TypeScript files
<tool_call name="search_files">
{"pattern": "**/*.ts", "cwd": "."}
</tool_call>

### Example: Search inside files
<tool_call name="search_text">
{"query": "class Runner", "cwd": ".", "glob": "*.ts"}
</tool_call>

### Example: Check the working directory
<tool_call name="get_cwd">
{}
</tool_call>

### Example: Search for a specific file
<tool_call name="search_files">
{"pattern": "README*"}
</tool_call>

### Example: Edit part of a file (PREFERRED for modifications)
<tool_call name="str_replace">
{"path": "src/index.ts", "old_string": "const version = '1.0.0'", "new_string": "const version = '2.0.0'"}
</tool_call>

### Example: Write a new file or full rewrite (COMPLETE content — never truncate)
<tool_call name="write_file">
{"path": "README.md", "content": "# My Project\\n\\nFull content here..."}
</tool_call>

## Rules
1. Call ONE tool at a time. Wait for the result before calling the next tool.
2. ALWAYS read a file with read_file before editing it.
3. Use str_replace for edits to existing files. Use write_file only for new files or complete rewrites.
4. The JSON inside the tool_call tag must be valid JSON. Escape newlines as \\n in strings.
5. Never call a tool that is not listed above.
6. If the user asks about the repo, paths, files, or current working directory, inspect with tools before answering.
7. Emit a short <status> before each major step and before the final answer.
8. When all tool work is done, write your final answer as plain prose.
9. NEVER write file contents in your text response — only write_file/str_replace saves to disk.

`.trim();
}

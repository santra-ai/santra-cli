import type { ToolName } from "../types/types.ts";

export type ToolParameterSchema = {
  type: "string" | "boolean" | "number";
  description: string;
  required?: boolean;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, ToolParameterSchema>;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the full text content of a file. Always read a file before writing it.",
    parameters: {
      path: {
        type: "string",
        description: "Relative or absolute path to the file.",
        required: true,
      },
    },
  },
  {
    name: "write_file",
    description:
      "Write (or overwrite) a file with the given content. Creates parent directories if missing.",
    parameters: {
      path: {
        type: "string",
        description: "File path to write to.",
        required: true,
      },
      content: {
        type: "string",
        description: "Full content to write.",
        required: true,
      },
    },
  },
  {
    name: "list_directory",
    description: "List the immediate children of a directory.",
    parameters: {
      path: {
        type: "string",
        description: "Directory path. Use '.' for cwd.",
        required: true,
      },
    },
  },
  {
    name: "search_files",
    description: "Find file paths matching a glob pattern.",
    parameters: {
      pattern: {
        type: "string",
        description: "Glob pattern, e.g. 'src/**/*.ts'.",
        required: true,
      },
      cwd: {
        type: "string",
        description: "Working directory. Defaults to '.'.",
        required: false,
      },
    },
  },
];

// Return one tool definition by name so callers can validate or inspect it.
export function getToolDefinition(name: ToolName): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

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
      "Write (or overwrite) a file with the given content. Use ONLY for new files or full rewrites. Creates parent directories if missing.",
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
    name: "str_replace",
    description:
      "Replace an exact string in an existing file. Use this for surgical edits — much better than rewriting the whole file. The old_string must match exactly (including whitespace and indentation).",
    parameters: {
      path: {
        type: "string",
        description: "Path to the file to edit.",
        required: true,
      },
      old_string: {
        type: "string",
        description: "The exact string to find and replace. Must be unique in the file.",
        required: true,
      },
      new_string: {
        type: "string",
        description: "The string to replace it with.",
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
  {
    name: "search_text",
    description:
      "Search file contents with ripgrep and return matching lines with file paths.",
    parameters: {
      query: {
        type: "string",
        description: "Text or regex to search for.",
        required: true,
      },
      cwd: {
        type: "string",
        description: "Working directory. Defaults to '.'.",
        required: false,
      },
      glob: {
        type: "string",
        description: "Optional glob filter, e.g. '*.ts' or 'src/**/*.tsx'.",
        required: false,
      },
    },
  },
  {
    name: "get_cwd",
    description: "Return the current working directory Santra is using.",
    parameters: {},
  },
];

// Return one tool definition by name so callers can validate or inspect it.
export function getToolDefinition(name: ToolName): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

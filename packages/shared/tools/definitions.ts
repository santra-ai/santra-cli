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
    name: "apply_patch",
    description:
      "Apply a unified diff style patch to one or more files. Prefer str_replace for small edits and apply_patch for coordinated multi-file changes.",
    parameters: {
      patch: {
        type: "string",
        description: "Unified diff patch text to apply.",
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
  {
    name: "spawn_agent",
    description:
      "Delegate a bounded subtask to a specialist agent. Use this when a focused file finder, reader, editor, reviewer, or thinker would help.",
    parameters: {
      agent: {
        type: "string",
        description:
          "Specialist agent to run, such as 'file-picker', 'reader', 'executor', 'reviewer', or 'thinker'.",
        required: true,
      },
      task: {
        type: "string",
        description:
          "A short, concrete task for the specialist agent to complete.",
        required: true,
      },
    },
  },
  {
    name: "spawn_agents",
    description:
      "Delegate several independent subtasks to specialist agents. Use this for parallel context gathering or review work.",
    parameters: {
      agents: {
        type: "string",
        description:
          "JSON array string of agent requests, each with {\"agent\": string, \"task\": string}.",
        required: true,
      },
    },
  },
  {
    name: "glob",
    description:
      "Find file paths matching a glob pattern. Useful for searching folders quickly.",
    parameters: {
      pattern: {
        type: "string",
        description: "Glob pattern, e.g. '**/*.ts' or 'agents/*.ts'.",
        required: true,
      },
      cwd: {
        type: "string",
        description: "Optional working directory. Defaults to '.'.",
      },
    },
  },
  {
    name: "code_search",
    description:
      "Search code with ripgrep and return matching lines. Prefer this over broad file reading when locating behavior or references.",
    parameters: {
      query: {
        type: "string",
        description: "Search pattern or regex.",
        required: true,
      },
      cwd: {
        type: "string",
        description: "Optional working directory. Defaults to '.'.",
      },
      glob: {
        type: "string",
        description: "Optional glob filter for files to search.",
      },
    },
  },
  {
    name: "read_subtree",
    description:
      "Read a compact recursive snapshot of a directory tree including file contents up to a size limit.",
    parameters: {
      path: {
        type: "string",
        description: "Directory path to read recursively.",
        required: true,
      },
      max_chars: {
        type: "number",
        description:
          "Maximum total characters to include across the subtree. Defaults to 12000.",
      },
    },
  },
  {
    name: "write_todos",
    description:
      "Write a structured todo list for the current task. This is lightweight planning memory for the current run.",
    parameters: {
      todos: {
        type: "string",
        description:
          "JSON array string of todo items, e.g. [{\"task\":\"Read files\",\"completed\":false}].",
        required: true,
      },
    },
  },
  {
    name: "run_terminal_command",
    description:
      "Run a shell command in the repository. Use this for verification, builds, tests, or inspection commands.",
    parameters: {
      command: {
        type: "string",
        description: "Shell command to run.",
        required: true,
      },
      cwd: {
        type: "string",
        description: "Optional working directory.",
      },
      timeout_ms: {
        type: "number",
        description: "Optional timeout in milliseconds. Defaults to 30000.",
      },
    },
  },
  {
    name: "set_output",
    description:
      "Set structured output for the current agent run. Useful for programmatic agents and selector agents.",
    parameters: {
      data: {
        type: "string",
        description:
          "JSON string or plain text payload to use as the agent output.",
        required: true,
      },
    },
  },
  {
    name: "set_messages",
    description:
      "Replace or append conversation messages for the current agent run. This is mainly for programmatic agents.",
    parameters: {
      messages: {
        type: "string",
        description: "JSON array string of messages.",
        required: true,
      },
      mode: {
        type: "string",
        description: "Either 'replace' or 'append'. Defaults to 'replace'.",
      },
    },
  },
  {
    name: "task_completed",
    description:
      "Signal that the current agent is done and optionally attach a short completion summary.",
    parameters: {
      summary: {
        type: "string",
        description: "Optional completion summary.",
      },
    },
  },
  {
    name: "suggest_followups",
    description:
      "Return a small set of suggested follow-up actions for the user.",
    parameters: {
      suggestions: {
        type: "string",
        description:
          "JSON array string of suggested follow-up prompts or next steps.",
        required: true,
      },
    },
  },
  {
    name: "lookup_agent_info",
    description:
      "Look up metadata about a registered agent, including its tools and spawnable agents.",
    parameters: {
      agent: {
        type: "string",
        description: "Agent id to inspect.",
        required: true,
      },
    },
  },
  {
    name: "ask_user",
    description:
      "Request clarification from the user. In the current CLI this is recorded as a paused question block.",
    parameters: {
      questions: {
        type: "string",
        description:
          "JSON array string of questions, each like {\"question\": string, \"header\"?: string, \"options\"?: [{\"label\": string, \"description\"?: string}]}.",
        required: true,
      },
      question: {
        type: "string",
        description:
          "Legacy single-question form. Prefer 'questions' instead of 'question'.",
        required: false,
      },
    },
  },
  {
    name: "web_search",
    description:
      "Search the public web for current information and return a short result list.",
    parameters: {
      query: {
        type: "string",
        description: "Search query.",
        required: true,
      },
    },
  },
  {
    name: "read_docs",
    description:
      "Read documentation from a URL or local path and return a compact text summary.",
    parameters: {
      source: {
        type: "string",
        description: "A URL or local file path to read.",
        required: true,
      },
    },
  },
];

// Return one tool definition by name so callers can validate or inspect it.
export function getToolDefinition(name: ToolName): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

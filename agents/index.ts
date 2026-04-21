import { baseAgent } from "./base.ts";
import { orchestratorAgent } from "./orchestrator.ts";
import { filePickerAgent } from "./file-picker.ts";
import { readerAgent } from "./reader.ts";
import { executorAgent } from "./executor.ts";
import { reviewerAgent } from "./reviewer.ts";
import { thinkerAgent } from "./thinker.ts";
import type { AgentTemplate } from "@santra/shared";

export type { AgentDefinition } from "./base.ts";

// ─── Built-in agent templates (used by the runtime)

import type { AgentDefinition } from "./base.ts";

export const BUILTIN_AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  orchestrator: {
    id: "orchestrator",
    displayName: "Main agent",
    description: "Generalist repo-aware agent that can inspect, edit, and delegate.",
    systemPrompt: orchestratorAgent.prompt,
    toolNames: [
      "read_file",
      "write_file",
      "str_replace",
      "apply_patch",
      "list_directory",
      "search_files",
      "search_text",
      "get_cwd",
      "spawn_agent",
      "spawn_agents",
      "glob",
      "code_search",
      "read_subtree",
      "write_todos",
      "run_terminal_command",
      "set_output",
      "task_completed",
      "suggest_followups",
      "lookup_agent_info",
      "set_messages",
      "ask_user",
      "web_search",
      "read_docs",
    ],
    spawnableAgents: ["file-picker", "reader", "executor", "reviewer", "thinker"],
    outputMode: "last_message",
  },
  "file-picker": {
    id: "file-picker",
    displayName: "File picker",
    description: "Focused repository explorer for locating and reading relevant files.",
    systemPrompt: filePickerAgent.prompt,
    toolNames: [
      "read_file",
      "list_directory",
      "search_files",
      "search_text",
      "get_cwd",
      "glob",
      "code_search",
      "read_subtree",
      "write_todos",
      "run_terminal_command",
      "task_completed",
    ],
  },
  reader: {
    id: "reader",
    displayName: "Reader",
    description: "Synthesize architecture and implementation details from repository context.",
    systemPrompt: readerAgent.prompt,
    toolNames: [
      "read_file",
      "list_directory",
      "search_files",
      "search_text",
      "get_cwd",
      "glob",
      "code_search",
      "read_subtree",
      "run_terminal_command",
      "task_completed",
    ],
  },
  executor: {
    id: "executor",
    displayName: "Executor",
    description: "Edit code once the right context is known.",
    systemPrompt: executorAgent.prompt,
    toolNames: [
      "read_file",
      "write_file",
      "str_replace",
      "apply_patch",
      "list_directory",
      "search_files",
      "search_text",
      "get_cwd",
      "glob",
      "code_search",
      "run_terminal_command",
      "task_completed",
    ],
  },
  reviewer: {
    id: "reviewer",
    displayName: "Reviewer",
    description: "Critique recent work and flag risks.",
    systemPrompt: reviewerAgent.prompt,
    toolNames: ["set_output", "task_completed"],
    outputMode: "last_message",
    handleSteps: function* () {
      yield "STEP_ALL";
      yield {
        toolName: "task_completed",
        input: { summary: "Review completed" },
      };
    },
  },
  thinker: {
    id: "thinker",
    displayName: "Thinker",
    description: "Reason through hard decisions and return concise conclusions.",
    systemPrompt: thinkerAgent.prompt,
    toolNames: ["spawn_agents", "set_output", "task_completed"],
    outputMode: "last_message",
    handleSteps: function* () {
      yield "STEP_ALL";
      yield {
        toolName: "task_completed",
        input: { summary: "Reasoning completed" },
      };
    },
  },
};

// ─── CLI agent registry (used by Client)

const registry: Record<string, AgentDefinition> = {
  [baseAgent.id]: baseAgent,
  ...Object.fromEntries(
    Object.values(BUILTIN_AGENT_TEMPLATES).map((template) => [
      template.id,
      {
        id: template.id,
        description: template.systemPrompt ?? template.description ?? "",
        endpoint: template.endpoint ?? baseAgent.endpoint,
      },
    ]),
  ),
};

export function getAgent(id: string): AgentDefinition {
  const agent = registry[id];
  if (!agent) throw new Error(`Agent "${id}" not found in registry.`);
  return agent;
}

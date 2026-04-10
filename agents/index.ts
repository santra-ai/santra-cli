import { baseAgent } from "./base.ts";
import { orchestratorAgent } from "./orchestrator.ts";
import { filePickerAgent } from "./file-picker.ts";
import { executorAgent } from "./executor.ts";
import { reviewerAgent } from "./reviewer.ts";

export type { AgentDefinition } from "./base.ts";

// ─── CLI agent registry (used by Client)

import type { AgentDefinition } from "./base.ts";

const registry: Record<string, AgentDefinition> = {
  [baseAgent.id]: baseAgent,
};

export function getAgent(id: string): AgentDefinition {
  const agent = registry[id];
  if (!agent) throw new Error(`Agent "${id}" not found in registry.`);
  return agent;
}

// ─── Swarm agent prompts (used by Swarm)

export const AGENT_PROMPTS: Record<AgentId, string> = {
  orchestrator: orchestratorAgent.prompt,
  "file-picker": filePickerAgent.prompt,
  executor: executorAgent.prompt,
  reviewer: reviewerAgent.prompt,
};

import type { AgentId } from "@santra/shared";

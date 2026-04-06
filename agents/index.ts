import { baseAgent } from "./base.ts";
import type { AgentDefinition } from "./base.ts";

export type { AgentDefinition };

const registry: Record<string, AgentDefinition> = {
  [baseAgent.id]: baseAgent,
};

export function getAgent(id: string): AgentDefinition {
  const agent = registry[id];
  if (!agent) throw new Error(`Agent "${id}" not found in registry.`);
  return agent;
}

export { baseAgent };

import { AgentOutputSchema } from "@santra/shared";

import { createAgentRuntime } from "./agent";
import { registerApiRoutes } from "./api";
import { listAgentTools } from "./tools";

export function bootstrapBackend() {
  return {
    agentRuntime: createAgentRuntime(),
    apiRoutes: registerApiRoutes(),
    tools: listAgentTools(),
    sharedSchemas: [AgentOutputSchema],
  };
}

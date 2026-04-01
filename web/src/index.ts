import { AgentOutputSchema } from "@santra/shared";

export function bootstrapWebApp() {
  return {
    name: "@santra/web",
    sharedSchemas: [AgentOutputSchema],
  };
}

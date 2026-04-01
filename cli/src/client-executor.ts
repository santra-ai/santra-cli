import type { RunState } from "./types";
import type { ExecuteParams } from "./types";

export async function clientExecuter(params: ExecuteParams): Promise<RunState> {
  return {
    output: {
      type: "structuredOutput",
      value: {
        prototype: true,
        stage: "send-message",
        agent: params.agent,
        prompt: params.prompt,
        hasPreviousRun: Boolean(params.previousRun),
      },
    },
  };
}

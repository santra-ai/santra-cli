import type { ExecuteParams, RunState } from "@santra/shared";

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

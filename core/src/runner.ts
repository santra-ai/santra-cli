import { BaseAgent } from "@santra/agent-runtime";
import type { RunState } from "@santra/shared";
import type { RunnerOptions, RunOptions } from "./types";

// This is the Runner Orchestration layer between cli and agent.
// owns the agent lifecycle, forwards the streaming deltas upward.
// and resolves the final Runstate.

export class Runner {
  private readonly agent: BaseAgent;

  constructor(options: RunnerOptions) {
    this.agent = new BaseAgent(options.agentEndpoint);
  }

  async run(options: RunOptions): Promise<RunState> {
    return this.agent.run({
      prompt: options.prompt,
      previousMessage: options.previousMessages,
      onDelta: options.onDelta,
    });
  }
}

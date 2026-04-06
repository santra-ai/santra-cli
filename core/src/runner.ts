import { BaseAgent } from "@santra/agent-runtime";
import type { RunState } from "@santra/shared";
import type { RunnerOptions, RunOptions } from "./types.ts";

// Runner — orchestration layer between CLI and agent-runtime.

// Owns the BaseAgent, forwards streaming deltas upward,
// and resolves the final RunState.

export class Runner {
  private readonly agent: BaseAgent;

  constructor(options: RunnerOptions) {
    this.agent = new BaseAgent(options.endpoint);
  }

  async run(options: RunOptions): Promise<RunState> {
    return this.agent.run({
      prompt: options.prompt,
      previousMessages: options.previousMessages,
      onDelta: options.onDelta,
    });
  }
}

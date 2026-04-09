import { BaseAgent, Swarm } from "@santra/agent-runtime";
import type { RunState } from "@santra/shared";
import type { RunnerOptions, RunOptions } from "./types.ts";

// Runner decides whether to use single-agent mode or swarm mode for a request.
export class Runner {
  private readonly agent: BaseAgent;
  private readonly swarm: Swarm;
  private readonly endpoint: string;
  private readonly useSwarm: boolean;

  constructor(options: RunnerOptions) {
    this.endpoint = options.endpoint;
    this.useSwarm = options.useSwarm ?? false;
    this.agent = new BaseAgent(options.endpoint);
    this.swarm = new Swarm(options.endpoint);
  }

  // Execute one prompt and normalize the return shape for callers.
  async run(options: RunOptions): Promise<RunState> {
    const swarm = options.useSwarm ?? this.useSwarm;

    if (swarm) {
      const state = await this.swarm.run({
        task: options.prompt,
        endpoint: this.endpoint,
        previousMessages: options.previousMessages,
        onPhase: options.onPhase,
      });
      return {
        messages: [
          ...(options.previousMessages ?? []),
          { role: "user", content: options.prompt },
          { role: "assistant", content: state.finalOutput },
        ],
        output: { type: "text", content: state.finalOutput },
        toolCalls: state.toolCallResults,
        thinking: state.thinkingSteps,
      };
    }

    return this.agent.run({
      prompt: options.prompt,
      previousMessages: options.previousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
    });
  }
}

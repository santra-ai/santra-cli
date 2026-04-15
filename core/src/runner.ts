import { BaseAgent, Swarm } from "@santra/agent-runtime";
import type { RunState } from "@santra/shared";
import type { RunnerOptions, RunOptions } from "./types.ts";

// Runner decides whether to use single-agent mode or swarm mode for a request.
export class Runner {
  private readonly agent: BaseAgent;
  private readonly swarm: Swarm;
  private readonly endpoint: string;
  private readonly useSwarm?: boolean;

  constructor(options: RunnerOptions) {
    this.endpoint = options.endpoint;
    this.useSwarm = options.useSwarm;
    this.agent = new BaseAgent(options.endpoint);
    this.swarm = new Swarm(options.endpoint);
  }

  private shouldUseSwarm(prompt: string, override?: boolean): boolean {
    if (override !== undefined) return override;
    // Orchestrator handles all routing internally (direct/read/write classification)
    return !!prompt.trim();
  }

  // Execute one prompt and normalize the return shape for callers.
  async run(options: RunOptions): Promise<RunState> {
    const explicitMode =
      options.useSwarm !== undefined ? options.useSwarm : this.useSwarm;
    const swarm = this.shouldUseSwarm(
      options.prompt,
      explicitMode,
    );

    if (swarm) {
      const state = await this.swarm.run({
        task: options.prompt,
        endpoint: this.endpoint,
        previousMessages: options.previousMessages,
        onPhase: options.onPhase,
        abortSignal: options.abortSignal,
        onFileChangeReview: options.onFileChangeReview,
      });

      if (state.error) {
        return {
          messages: [
            ...(options.previousMessages ?? []),
            { role: "user", content: options.prompt },
          ],
          output: { type: "error", message: state.error },
          toolCalls: state.toolCallResults,
          thinking: state.thinkingSteps,
        };
      }

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
      abortSignal: options.abortSignal,
      onFileChangeReview: options.onFileChangeReview,
    });
  }
}

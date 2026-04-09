import { Runner } from "@santra/core";
import { getAgent } from "../../agents/index.ts";
import type { RunState, Message, AgentPhase } from "@santra/shared";

export type ClientRunOptions = {
  prompt: string;
  previousState?: RunState;
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  useSwarm?: boolean;
};

export type ClientConfig = {
  agentId?: string;
};

export class Client {
  private readonly runner: Runner;
  private readonly systemMessage: Message;

  constructor(config: ClientConfig = {}) {
    const agent = getAgent(config.agentId ?? "base");
    this.systemMessage = { role: "system", content: agent.description };
    this.runner = new Runner({ endpoint: agent.endpoint });
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    const previousMessages: Message[] = options.previousState?.messages ?? [
      this.systemMessage,
    ];

    return this.runner.run({
      prompt: options.prompt,
      previousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
      useSwarm: options.useSwarm ?? false,
    });
  }
}

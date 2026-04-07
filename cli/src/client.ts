import { Runner } from "@santra/core";
import { getAgent } from "../../agents/index.ts";
import type { RunState, Message } from "@santra/shared";

export type ClientRunOptions = {
  prompt: string;
  previousState?: RunState;
  onDelta?: (chunk: string) => void;
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
    // If this is the first turn, prepend the system message.
    // On subsequent turns the system message is already in previousState.messages.
    const previousMessages: Message[] = options.previousState?.messages ?? [
      this.systemMessage,
    ];

    return this.runner.run({
      prompt: options.prompt,
      previousMessages,
      onDelta: options.onDelta,
    });
  }
}

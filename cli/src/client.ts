import { Runner } from "@santra/core";
import { getAgent } from "../../agents/index.ts"; // ← yahan se
import type { RunState } from "@santra/shared";

// types
export type ClientRunOptions = {
  prompt: string;
  previousState?: RunState;
};

export type ClientConfig = {
  agentId?: string;
};

// client

export class Client {
  private readonly runner: Runner;
  private readonly agentDescription: string;

  constructor(config: ClientConfig = {}) {
    const agent = getAgent(config.agentId ?? "base");
    this.agentDescription = agent.description;

    this.runner = new Runner({
      endpoint: agent.endpoint,
    });
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    const promptWithDescription = `System instruction: ${this.agentDescription}\n\nUser: ${options.prompt}`;

    const state = await this.runner.run({
      prompt: promptWithDescription,
      previousMessages: options.previousState?.messages,
      onDelta: (chunk) => {
        process.stdout.write(chunk);
      },
    });
  }
}

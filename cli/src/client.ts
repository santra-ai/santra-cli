import { Runner } from "@santra/core";
import type { RunState } from "@santra/shared";

// Types
export type ClientRunOptions = {
  prompt: string;
  previousState?: RunState;
};

export type ClientConfig = {
  agentEndpoint?: string;
};

// client
// connects to runner and returns the resolved RunState
// and returns the resolved Runstate

export class Client {
  private readonly runner: Runner;

  constructor(config: ClientConfig = {}) {
    this.runner = new Runner({
      agentEndpoint:
        config.agentEndpoint ??
        process.env["AGENT_ENDPOINT"] ??
        "http://localhost:3000/api/v1/chat/completion/",
    });
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    return this.runner.run({
      prompt: options.prompt,
      previousMessages: options.previousState?.messages,
      onDelta: (chunk) => {
        process.stdout.write(chunk);
      },
    });
  }
}

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
// connects to runner with live token streaming to stdout
// and returns the resolved Runstate

export class Client {
  private readonly runner: Runner;

  constructor(config: ClientConfig = {}) {
    this.runner = new Runner({
      agentEndpoint:
        config.agentEndpoint ??
        process.env["AGENT_ENDPOINT"] ??
        "http://localhost:3000/api/v1/comppletions",
    });
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    const state = await this.runner.run({
      prompt: options.prompt,
      previousMessages: options.previousState?.messages,
      onDelta: (chunk) => {
        process.stdout.write(chunk);
      },
    });

    process.stdout.write("\n\n");

    return state;
  }
}

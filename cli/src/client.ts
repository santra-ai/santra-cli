import { Runner } from "@santra/core";
import { getAgent } from "../../agents/index.ts";
import type { RunState, Message, AgentPhase } from "@santra/shared";
import type { FileChangeFeedback, UserQuestion } from "@santra/agent-runtime";

export type ClientRunOptions = {
  prompt: string;
  previousState?: RunState;
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  useSwarm?: boolean;
  abortSignal?: AbortSignal;
  onFileChangeReview?: (
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
  onUserQuestion?: (questions: UserQuestion[]) => Promise<string>;
};

export type ClientConfig = {
  agentId?: string;
};

export class Client {
  private readonly runner: Runner;
  private readonly systemMessage: Message;

  constructor(config: ClientConfig = {}) {
    const agent = getAgent(config.agentId ?? "orchestrator");
    this.systemMessage = { role: "system", content: agent.description };
    this.runner = new Runner({ endpoint: agent.endpoint });
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    let previousMessages: Message[];

    if (
      options.previousState?.messages &&
      options.previousState.messages.length > 0
    ) {
      previousMessages = options.previousState.messages;
    } else {
      previousMessages = [this.systemMessage];
    }

    return this.runner.run({
      prompt: options.prompt,
      previousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
      useSwarm: options.useSwarm,
      abortSignal: options.abortSignal,
      onFileChangeReview: options.onFileChangeReview,
      onUserQuestion: options.onUserQuestion,
    });
  }
}

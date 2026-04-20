import { Runner } from "@santra/core";
import { getAgent } from "../../agents/index.ts";
import type { RunState, Message, AgentPhase } from "@santra/shared";
import type { FileChangeFeedback, UserQuestion } from "@santra/agent-runtime";
import {
  consumeTrialTokens,
  estimateTokens,
  getAuthHeaders,
  getDefaultHostedConfig,
  readConfig,
  readTrialState,
  usingHostedAccess,
} from "./utils/config.ts";

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
  private readonly systemMessage: Message;
  private readonly endpoint: string;
  private runner: Runner | null = null;
  private authHeadersKey = "";

  constructor(config: ClientConfig = {}) {
    const agent = getAgent(config.agentId ?? "orchestrator");
    this.systemMessage = { role: "system", content: agent.description };
    this.endpoint = agent.endpoint;
  }

  private getRunner(): Runner {
    const santraConfig = readConfig() ?? getDefaultHostedConfig();
    const authHeaders = santraConfig ? getAuthHeaders(santraConfig) : undefined;
    const nextKey = JSON.stringify(authHeaders ?? null);

    if (!this.runner || this.authHeadersKey !== nextKey) {
      this.authHeadersKey = nextKey;
      this.runner = new Runner({ endpoint: this.endpoint, authHeaders });
    }

    return this.runner;
  }

  async run(options: ClientRunOptions): Promise<RunState> {
    const currentConfig = readConfig();
    if (usingHostedAccess(currentConfig)) {
      const trial = readTrialState();
      if (trial.remainingTokens <= 0) {
        const previousMessages =
          options.previousState?.messages && options.previousState.messages.length > 0
            ? options.previousState.messages
            : [this.systemMessage];
        return {
          messages: [
            ...previousMessages,
            {
              role: "assistant",
              content:
                "Your Santra hosted trial is out of tokens. Run /setup and choose BYOK to continue with your own provider key.",
            },
          ],
          output: {
            type: "error",
            message:
              "Your Santra hosted trial is out of tokens. Run /setup and choose BYOK to continue.",
          },
        };
      }
    }

    let previousMessages: Message[];

    if (
      options.previousState?.messages &&
      options.previousState.messages.length > 0
    ) {
      previousMessages = options.previousState.messages;
    } else {
      previousMessages = [this.systemMessage];
    }

    const state = await this.getRunner().run({
      prompt: options.prompt,
      previousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
      useSwarm: options.useSwarm,
      abortSignal: options.abortSignal,
      onFileChangeReview: options.onFileChangeReview,
      onUserQuestion: options.onUserQuestion,
    });

    if (usingHostedAccess(currentConfig)) {
      const promptTokens = estimateTokens(options.prompt);
      const outputTokens =
        state.output.type === "text" ? estimateTokens(state.output.content) : 0;
      const historyTokens = Math.min(
        300,
        estimateTokens(previousMessages.map((message) => message.content).join("\n")),
      );
      consumeTrialTokens(promptTokens + outputTokens + historyTokens);
    }

    return state;
  }
}

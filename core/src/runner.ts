import { BaseAgent, Swarm } from "@santra/agent-runtime";
import type { AgentPhase, RunState, ToolCallResult } from "@santra/shared";
import type { RunnerOptions, RunOptions } from "./types.ts";
import { classifyPrompt } from "./classifier.ts";

const DIRECT_ANSWER_PROMPT = `
You are Santra responding directly to the user.

Write clear, structured plain text.
- Start with a markdown heading like "# Title" or "## Title" when the answer is more than a short sentence.
- Use blank lines between paragraphs and sections.
- For essays and longer explanations, use short paragraphs and section headings when helpful.
- Do not write file contents to disk.
- Do not mention tools, planning, or internal process.
- Do not begin with filler like "Certainly!" unless the user asked for that tone.
`.trim();

const SIMPLE_CHAT_PROMPT = `
You are Santra in casual conversation mode.

- Reply naturally and briefly.
- Do not inspect files, discuss tools, or talk like a coding agent.
- Do not propose edits, plans, or repository exploration unless the user asks.
- Keep greetings and acknowledgements to one short sentence.
`.trim();

function stripSystemMessages(previousMessages?: RunOptions["previousMessages"]) {
  return (previousMessages ?? []).filter((message) => message.role !== "system");
}

function ensurePromptInHistory(
  messages: NonNullable<RunOptions["previousMessages"]>,
  prompt: string,
) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return [...messages];

  const hasPrompt = messages.some(
    (message) =>
      message.role === "user" && message.content.trim() === trimmedPrompt,
  );

  return hasPrompt
    ? [...messages]
    : [...messages, { role: "user" as const, content: prompt }];
}

function summarizeToolResult(result: ToolCallResult): string {
  if (result.error) {
    return `${result.name} failed: ${result.error}`;
  }

  try {
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    if (typeof parsed["path"] === "string") {
      return `${result.name} on ${parsed["path"]}`;
    }
    if (typeof parsed["message"] === "string") {
      return `${result.name}: ${parsed["message"]}`;
    }
  } catch {
    // ignore JSON parse failure
  }

  return `${result.name} completed`;
}

function buildContinuationMessage(
  prompt: string,
  phases: AgentPhase[],
  toolCallResults: ToolCallResult[],
  error: string,
): string {
  const recentStatuses = phases
    .filter((phase): phase is Extract<AgentPhase, { type: "status" }> => phase.type === "status")
    .map((phase) => phase.message.trim())
    .filter(Boolean)
    .slice(-3);

  const recentTools = toolCallResults
    .slice(-6)
    .map((result) => `- ${summarizeToolResult(result)}`);

  const lines = [
    `Continuation context for: ${prompt}`,
    recentStatuses.length > 0
      ? `Recent progress: ${recentStatuses.join(" -> ")}`
      : "Recent progress: none captured",
    recentTools.length > 0 ? "Recent tool results:" : "Recent tool results: none captured",
    ...recentTools,
    `Last error: ${error}`,
    "Resume from this exact point. Do not restart from the repository root unless necessary.",
  ];

  return lines.join("\n");
}

// Runner decides whether to use single-agent mode or swarm mode for a request.
export class Runner {
  private readonly agent: BaseAgent;
  private readonly swarm: Swarm;
  private readonly endpoint: string;
  private readonly useSwarm?: boolean;

  constructor(options: RunnerOptions) {
    this.endpoint = options.endpoint;
    this.useSwarm = options.useSwarm;
    this.agent = new BaseAgent(options.endpoint, options.authHeaders);
    this.swarm = new Swarm(options.endpoint, options.authHeaders);
  }

  private shouldUseSwarm(override?: boolean): boolean {
    if (override !== undefined) return override;
    // Default to the dynamic multi-agent runtime. This matches the newer
    // Codebuff-style architecture better: the main orchestrator decides whether
    // to inspect files, answer directly, or delegate to specialists.
    return true;
  }

  // Execute one prompt and normalize the return shape for callers.
  async run(options: RunOptions): Promise<RunState> {
    const classification = classifyPrompt(options.prompt);
    const explicitMode =
      options.useSwarm !== undefined ? options.useSwarm : this.useSwarm;
    const swarm = this.shouldUseSwarm(explicitMode);

    if (swarm) {
      const state = await this.swarm.run({
        task: options.prompt,
        endpoint: this.endpoint,
        previousMessages: options.previousMessages,
        onPhase: options.onPhase,
        abortSignal: options.abortSignal,
        onFileChangeReview: options.onFileChangeReview,
        onUserQuestion: options.onUserQuestion,
      });

      if (state.error) {
        const continuation = buildContinuationMessage(
          options.prompt,
          state.phases,
          state.toolCallResults,
          state.error,
        );
        const messagesWithPrompt = ensurePromptInHistory(
          state.messages,
          options.prompt,
        );
        return {
          messages: [
            ...messagesWithPrompt,
            { role: "assistant", content: continuation },
          ],
          output: { type: "error", message: state.error },
          toolCalls: state.toolCallResults,
          thinking: state.thinkingSteps,
        };
      }

      return {
        messages: state.messages,
        output: { type: "text", content: state.finalOutput },
        toolCalls: state.toolCallResults,
        thinking: state.thinkingSteps,
      };
    }

    const sanitizedPreviousMessages =
      classification === "agent_task"
        ? options.previousMessages
        : stripSystemMessages(options.previousMessages);

    const systemPrompt =
      classification === "direct_answer"
        ? DIRECT_ANSWER_PROMPT
        : classification === "simple_chat"
          ? SIMPLE_CHAT_PROMPT
          : undefined;

    return this.agent.run({
      prompt: options.prompt,
      systemPrompt,
      suppressProgressPhases: classification === "direct_answer",
      previousMessages: sanitizedPreviousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
      abortSignal: options.abortSignal,
      onFileChangeReview: options.onFileChangeReview,
      onUserQuestion: options.onUserQuestion,
    });
  }
}

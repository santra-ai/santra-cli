import { BaseAgent, Swarm } from "@santra/agent-runtime";
import type { RunState } from "@santra/shared";
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
    });
  }
}

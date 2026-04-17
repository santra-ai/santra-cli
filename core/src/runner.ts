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
    const classification = classifyPrompt(prompt);
    if (classification !== "agent_task") return false;
    if (override !== undefined) return override;
    // Skip swarm for simple chat and direct questions — only agent tasks need orchestration
    return true;
  }

  // Execute one prompt and normalize the return shape for callers.
  async run(options: RunOptions): Promise<RunState> {
    const classification = classifyPrompt(options.prompt);
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
      systemPrompt:
        classification === "direct_answer" ? DIRECT_ANSWER_PROMPT : undefined,
      suppressProgressPhases: classification === "direct_answer",
      previousMessages: options.previousMessages,
      onDelta: options.onDelta,
      onPhase: options.onPhase,
      abortSignal: options.abortSignal,
      onFileChangeReview: options.onFileChangeReview,
    });
  }
}

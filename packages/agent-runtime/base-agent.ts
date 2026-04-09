import type {
  Message,
  CompletionRequest,
  WebStreamEvent,
  RunState,
  AgentPhase,
  ToolCallRequest,
  ToolCallResult,
  ThinkingStep,
  AgentId,
} from "@santra/shared";
import { StreamParser } from "./tools/parser.ts";
import { executeToolCall } from "./tools/local-runner.ts";

export type AgentRunOptions = {
  prompt: string;
  agentId?: AgentId;
  systemPrompt?: string;
  previousMessages?: Message[];
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  maxToolIterations?: number;
};

// ─── SSE helpers ──────────────────────────────────────────────────────────────

// Parse one raw SSE line from the web endpoint into a typed event.
function parseSSELine(raw: string): WebStreamEvent | null {
  const line = raw.trim();
  if (!line.startsWith("data:")) return null;
  const payload = line.slice("data:".length).trim();
  if (!payload) return null;
  try {
    return JSON.parse(payload) as WebStreamEvent;
  } catch {
    return null;
  }
}

// Read the SSE response stream and yield typed events one by one.
async function* readSSE(reader: {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}): AsyncGenerator<WebStreamEvent> {
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = parseSSELine(line);
      if (!ev) continue;
      yield ev;
      if (ev.type === "finish" || ev.type === "error") return;
    }
  }
}

// ─── BaseAgent ────────────────────────────────────────────────────────────────

export class BaseAgent {
  constructor(private readonly endpoint: string) {}

  // Run a single network turn and collect the final text for that turn.
  private async singleTurn(
    messages: Message[],
    onDelta?: (c: string) => void,
  ): Promise<{ text: string; error?: string }> {
    const body: CompletionRequest = {
      prompt: messages.at(-1)?.content ?? "",
      messages,
    };
    let resp: Response;
    try {
      resp = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        text: "",
        error: err instanceof Error ? err.message : "Network error",
      };
    }
    if (!resp.ok)
      return { text: "", error: `HTTP ${resp.status}: ${resp.statusText}` };
    if (!resp.body) return { text: "", error: "Empty response body" };

    const reader = resp.body.getReader();
    let finalText = "";
    for await (const ev of readSSE(reader)) {
      if (ev.type === "delta") onDelta?.(ev.content);
      if (ev.type === "text") finalText = ev.text;
      if (ev.type === "error") return { text: finalText, error: ev.message };
    }
    return { text: finalText };
  }

  // Run the agent loop: call model, execute tools, feed results back, repeat.
  async run(options: AgentRunOptions): Promise<RunState> {
    const {
      prompt,
      agentId = "executor",
      systemPrompt,
      previousMessages = [],
      onDelta,
      onPhase,
      maxToolIterations = 8,
    } = options;

    const messages: Message[] = [
      ...(systemPrompt
        ? [{ role: "system" as const, content: systemPrompt }]
        : []),
      ...previousMessages,
      { role: "user" as const, content: prompt },
    ];

    const allToolResults: ToolCallResult[] = [];
    const allThinking: ThinkingStep[] = [];
    let finalText = "";

    for (let i = 0; i < maxToolIterations; i++) {
      const { text, error } = await this.singleTurn(messages, onDelta);

      if (error) {
        return {
          messages,
          output: { type: "error", message: error },
          toolCalls: allToolResults,
          thinking: allThinking,
        };
      }

      // Parse tool calls and thinking out of the response
      const toolCalls: ToolCallRequest[] = [];
      let textContent = "";

      const parser = new StreamParser((chunk) => {
        if (chunk.type === "text") {
          textContent += chunk.content;
        } else if (chunk.type === "thinking") {
          const step: ThinkingStep = { agentId, content: chunk.content };
          allThinking.push(step);
          onPhase?.({ type: "thinking", agentId, delta: chunk.content });
        } else if (chunk.type === "tool_call") {
          toolCalls.push(chunk.call);
        }
      });
      parser.push(text);
      parser.finish();

      // Add raw assistant message to history
      messages.push({ role: "assistant", content: text });

      if (toolCalls.length === 0) {
        finalText = textContent || text;
        break;
      }

      // Execute each tool call and collect results
      const resultBlocks: string[] = [];
      for (const call of toolCalls) {
        onPhase?.({ type: "tool_call", call });
        const result = await executeToolCall(call);
        allToolResults.push(result);
        onPhase?.({ type: "tool_result", result });
        resultBlocks.push(
          `<tool_result name="${result.name}" id="${result.id}">\n${result.output}\n</tool_result>`,
        );
      }

      // Feed tool results back as a user message for next iteration
      messages.push({ role: "user", content: resultBlocks.join("\n\n") });
    }

    return {
      messages: [...messages, { role: "assistant", content: finalText }],
      output: { type: "text", content: finalText },
      toolCalls: allToolResults,
      thinking: allThinking,
    };
  }
}

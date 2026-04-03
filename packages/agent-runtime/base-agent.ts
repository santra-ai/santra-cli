import type {
  Message,
  CompletionRequest,
  CompletionChunk,
  StreamEvent,
  RunState,
} from "@santra/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessage?: Message[];
  onDelta?: (chunk: string) => void;
};

// SSE  parser

const DONE_SENTINEL = "[DONE]";

function parseSSELine(raw: string): CompletionChunk | null {
  // removing extra spaces
  const line = raw.trim();

  // if there is not data available
  if (!line.startsWith("data:")) return null;

  const payload = line.slice("data:".length).trim();
  if (payload === DONE_SENTINEL) return null;

  try {
    return JSON.parse(payload) as CompletionChunk;
  } catch {
    return null;
  }
}

async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();

  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      yield { type: "done", fullContent };
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const chunk = parseSSELine(line);
      if (!chunk) continue;

      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        yield { type: "delta", content: delta };
      }

      if (chunk.choices[0]?.finish_reason === "stop") {
        yield { type: "done", fullContent };
        return;
      }
    }
  }
}

// This is my Base Agent
// Sends the conversation to the backend's /api/v1/completions
// consule the SSE stream, and returns a resolved RunState.
// Has no knowledge of which LLM provider is used as of now that's backend concern will add in future.

export class BaseAgent {
  constructor(private readonly endpoint: string) {}

  async run(options: AgentRunOptions): Promise<RunState> {
    const { prompt, previousMessage = [], onDelta } = options;

    const userMessage: Message = { role: "user", content: prompt };
    const messages: Message[] = [...previousMessage, userMessage];

    const body: CompletionRequest = { prompt, messages };

    // fetching the backend here
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network Error";
      return { messages, output: { type: "error", message } };
    }

    if (!response.ok) {
      return {
        messages,
        output: {
          type: "error",
          message: `Backend returned ${response.status} : ${response.statusText} `,
          statusCode: response.status,
        },
      };
    }

    if (!response.body) {
      return {
        messages,
        output: { type: "error", message: "Response body is empty." },
      };
    }

    // if Everythig goes fine

    const reader = response.body.getReader() as ReadableStreamDefaultReader<
      Uint8Array<ArrayBufferLike>
    >;
    let finalContent = "";

    for await (const event of readSSEStream(reader)) {
      switch (event.type) {
        case "delta":
          finalContent += event.content;
          onDelta?.(event.content);
          break;

        case "done":
          finalContent = event.fullContent;
          break;

        case "error":
          return {
            messages,
            output: {
              type: "error",
              message: event.message,
              statusCode: event.statusCode,
            },
          };
      }
    }

    const assistantMessage: Message = {
      role: "assistant",
      content: finalContent,
    };

    return {
      messages: [...messages, assistantMessage],
      output: { type: "text", content: finalContent },
    };
  }
}

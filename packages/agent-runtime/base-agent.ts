import type {
  Message,
  CompletionRequest,
  RunState,
} from "@santra/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessage?: Message[];
  onDelta?: (chunk: string) => void;
};

const DONE_SENTINEL = "[DONE]";

function parseSSEDataLine(rawLine: string): string | null {
  const line = rawLine.replace(/\r$/, "");
  if (!line.startsWith("data:")) return null;

  const data = line.slice("data:".length).replace(/^ /, "");
  if (!data || data === DONE_SENTINEL) return null;

  return data;
}

async function readTextStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const data = parseSSEDataLine(line);
      if (!data) continue;

      fullContent += data;
      onDelta?.(data);
    }
  }

  if (buffer) {
    const data = parseSSEDataLine(buffer);
    if (data) {
      fullContent += data;
      onDelta?.(data);
    }
  }

  return fullContent;
}

// This is my Base Agent
// Sends the conversation to the backend's /api/v1/completions
// resolves the processed SSE response into a RunState.
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

    const reader = response.body.getReader() as ReadableStreamDefaultReader<
      Uint8Array<ArrayBufferLike>
    >;
    const finalContent = await readTextStream(reader, onDelta);

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

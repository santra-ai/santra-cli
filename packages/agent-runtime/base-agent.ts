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

function extractTextFromSSE(payload: string): string {
  const content: string[] = [];

  for (const rawLine of payload.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.startsWith("data:")) continue;

    const data = line.slice("data:".length).replace(/^ /, "");
    if (!data || data === DONE_SENTINEL) continue;

    content.push(data);
  }

  return content.join("");
}

// This is my Base Agent
// Sends the conversation to the backend's /api/v1/completions
// resolves the processed SSE response into a RunState.
// Has no knowledge of which LLM provider is used as of now that's backend concern will add in future.

export class BaseAgent {
  constructor(private readonly endpoint: string) {}

  async run(options: AgentRunOptions): Promise<RunState> {
    const { prompt, previousMessage = [] } = options;

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

    const finalContent = extractTextFromSSE(await response.text());

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

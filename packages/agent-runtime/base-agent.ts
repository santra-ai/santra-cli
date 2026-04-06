import type { ChatCompletionRequestBody, CompletionRequest, Message, RunState } from "@santra/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessage?: ChatCompletionRequestBody["messages"];
  onDelta?: (chunk: string) => void;
};

async function readTextStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    fullContent += chunk;
    onDelta?.(chunk);
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

    const userMessage: ChatCompletionRequestBody["messages"][0] = { role: "user", content: prompt };
    const messages: ChatCompletionRequestBody["messages"] = [...previousMessage, userMessage];

    const body: CompletionRequest = { prompt, messages };

    // fetching the backend here
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/plain",
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

    const reader = response.body.getReader();
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

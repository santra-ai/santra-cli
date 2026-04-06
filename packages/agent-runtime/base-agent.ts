import type {
  Message,
  CompletionRequest,
  WebStreamEvent,
  RunState,
} from "@santra/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessages?: Message[];
  onDelta?: (chunk: string) => void;
};

// web sse parser
// parses the protocol that /web/api/v1/completions sends back

function parseWebSSELine(raw: string): WebStreamEvent | null {
  const line = raw.trim();
  if (!line.startsWith("data:")) return null;

  const payload = line.slice("data:".length).trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload) as WebStreamEvent;
  } catch (error) {
    return null;
  }
}

async function* readWebStream(reader: {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}): AsyncGenerator<WebStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) return;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const event = parseWebSSELine(line);
      if (!event) continue;

      yield event;

      // Stop consuming after finish or error — no more events expected
      if (event.type === "finish" || event.type === "error") return;
    }
  }
}

// this is my base agent.
// makes a request to /web/api/v1/completetions.
// santra handles nvidia nim and streams back in out webSteamEvent Protocol.
// Base Agent consumes that stream and resolves to the Runstate.

// has zero knowledgeo of which llm provider web uses -- to be added in future.

export class BaseAgent {
  constructor(private readonly endpoint: string) {}

  async run(options: AgentRunOptions): Promise<RunState> {
    const { prompt, previousMessages = [], onDelta } = options;

    const userMessage: Message = { role: "user", content: prompt };
    const messages: Message[] = [...previousMessages, userMessage];

    const body: CompletionRequest = { prompt, messages };

    // simple fetch method calling

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      return { messages, output: { type: "error", message } };
    }

    if (!response.ok) {
      return {
        messages,
        output: {
          type: "error",
          message: `Web returned ${response.status}: ${response.statusText}`,
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

    // consume sse stream send my server

    const reader = response.body.getReader();
    let finalContent = "";

    for await (const event of readWebStream(reader)) {
      switch (event.type) {
        case "start":
          // stream started : no data to send.
          break;

        case "delta":
          // first token arroved. print first token.
          onDelta?.(event.content);
          break;

        case "reasoning":
          // reasoning token ignoring for now.
          break;

        case "text":
          // sending complete final thing for web
          finalContent = event.text;
          break;

        case "finish":
          // done now exit the loop
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

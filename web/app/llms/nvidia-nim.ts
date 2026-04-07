import { AvailableModelId, Message } from "@santra/shared";
import type {
  ChatCompletionChunk,
  ChatCompletionRequestBody,
} from "./types.ts";

// ─── Config

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DONE_SENTINEL = "[DONE]";
const SYSTEM_PROMPT =
  "You are a helpful, concise, and accurate assistant. Respond clearly and directly to the user's message.";

export const DEFAULT_MODEL: AvailableModelId = "meta/llama-3.1-8b-instruct";

interface NvidiaNIMConfig {
  apiKey: string;
  baseURL?: string;
}

// ─── NvidiaNIM class

export class NvidiaNIM {
  private apiKey: string;
  private baseURL: string;

  chat: {
    message: (
      options: ChatCompletionRequestBody,
    ) => Promise<ReadableStream<Uint8Array>>;
  };

  constructor(config: NvidiaNIMConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? NVIDIA_DEFAULT_BASE_URL;

    this.chat = {
      message: this.chatMessage.bind(this),
    };
  }

  private async chatMessage(
    options: ChatCompletionRequestBody,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: options.stream,
      }),
    });

    if (!response.ok)
      throw new Error(
        `NIM request failed: ${response.status} ${response.statusText}`,
      );
    if (!response.body) throw new Error("NIM response body is empty.");

    const reader = response.body.getReader();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const decoder = new TextDecoder("utf-8");
        const encoder = new TextEncoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice("data: ".length).trim();
            if (data === DONE_SENTINEL) break;

            try {
              const json = JSON.parse(data) as ChatCompletionChunk;
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // malformed chunk — skip
            }
          }
        }

        controller.close();
      },
    });
  }
}

// ─── Helpers used by route.ts

export function buildNimMessages(
  prompt: string,
  history: Message[],
): ChatCompletionRequestBody["messages"] {
  const trimmedPrompt = prompt.trim();
  const mappedHistory = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const lastMessage = mappedHistory.at(-1);
  const alreadyHasPromptTurn =
    lastMessage?.role === "user" && lastMessage.content === trimmedPrompt;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...mappedHistory,
    ...(alreadyHasPromptTurn ? [] : [{ role: "user", content: trimmedPrompt }]),
  ];
}

// ─── createWebStreamFromNimResponse
// Wraps the raw delta stream from NvidiaNIM into the WebStreamEvent SSE
// protocol that BaseAgent in agent-runtime expects.

function sseLine(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createWebStreamFromNimResponse(
  nimDeltaStream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = nimDeltaStream.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullContent = "";
      let closed = false;

      function enqueue(data: object) {
        if (!closed) controller.enqueue(encoder.encode(sseLine(data)));
      }

      function close() {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }

      try {
        enqueue({ type: "start" });

        // Use a separate decoder with stream:true only once, not twice
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // value is already a clean encoded delta from NvidiaNIM class
          // decode once here, no re-buffering issues
          const delta = decoder.decode(value); // no { stream: true } — flush immediately
          if (delta) {
            fullContent += delta;
            enqueue({ type: "delta", content: delta });
          }
        }

        enqueue({ type: "text", text: fullContent });
        enqueue({ type: "finish" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "NIM stream processing failed.";
        console.error("[NvidiaNIM] stream error:", message);
        enqueue({ type: "error", message, statusCode: 500 });
      } finally {
        close();
      }
    },
  });
}

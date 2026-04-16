import { AvailableModelId, Message } from "@santra/shared";
import type {
  ChatCompletionChunk,
  ChatCompletionRequestBody,
} from "./types.ts";

// ─── Typed error

export class NvidiaNIMError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Parsed from the upstream Retry-After header (seconds). */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "NvidiaNIMError";
  }
}

// ─── Config

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DONE_SENTINEL = "[DONE]";

export const DEFAULT_MODEL: AvailableModelId = "meta/llama-3.1-8b-instruct";

interface NvidiaNIMConfig {
  apiKey: string;
  baseURL?: string;
}

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
        // qwen2.5-coder-32b has a 32768 total context window
        max_tokens: 16384,
        temperature: 0.1, // Low temp for reliable tool calls
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = (await response.json()) as {
          detail?: string;
          message?: string;
          error?: string;
        };
        detail = errBody.detail ?? errBody.message ?? errBody.error ?? "";
      } catch {
        detail = await response.text().catch(() => "");
      }
      const retryAfterRaw = response.headers.get("Retry-After");
      const retryAfterSeconds =
        retryAfterRaw != null && /^\d+$/.test(retryAfterRaw.trim())
          ? Number(retryAfterRaw)
          : undefined;
      throw new NvidiaNIMError(
        `NIM request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`,
        response.status,
        retryAfterSeconds,
      );
    }
    if (!response.body) throw new Error("NIM response body is empty.");

    const reader = response.body.getReader();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const decoder = new TextDecoder("utf-8");
        const encoder = new TextEncoder();
        let buffer = "";
        let seenDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice("data: ".length).trim();
            if (data === DONE_SENTINEL) {
              seenDone = true;
              break;
            }

            try {
              const json = JSON.parse(data) as ChatCompletionChunk;
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // malformed chunk — skip
            }
          }

          if (seenDone) break;
        }

        controller.close();
      },
    });
  }
}

// ─── buildNimMessages
// Pass messages through directly — each agent brings its own system prompt.
// We do NOT inject a global system prompt here as it would conflict with agent prompts.
export function buildNimMessages(
  prompt: string,
  history: Message[],
): ChatCompletionRequestBody["messages"] {
  const trimmedPrompt = prompt.trim();

  // If history already has messages, use them directly (they include system prompts)
  if (history.length > 0) {
    const mappedHistory = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const lastMessage = mappedHistory.at(-1);
    const alreadyHasPromptTurn =
      lastMessage?.role === "user" && lastMessage.content === trimmedPrompt;

    return [
      ...mappedHistory,
      ...(alreadyHasPromptTurn
        ? []
        : [{ role: "user" as const, content: trimmedPrompt }]),
    ];
  }

  // No history — just the user message
  return [{ role: "user" as const, content: trimmedPrompt }];
}

// ─── createWebStreamFromNimResponse

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
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseLine(data)));
        } catch {
          closed = true;
        }
      }

      function close() {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Client may already be gone.
          }
        }
      }

      try {
        enqueue({ type: "start" });

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const delta = decoder.decode(value, { stream: true });
          if (delta) {
            fullContent += delta;
            enqueue({ type: "delta", content: delta });
          }
        }

        const finalChunk = decoder.decode();
        if (finalChunk) {
          fullContent += finalChunk;
          enqueue({ type: "delta", content: finalChunk });
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
        await reader.cancel().catch(() => {});
        close();
      }
    },
  });
}

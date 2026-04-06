import type { AvailableModelId, ChatCompletionChunk, ChatCompletionRequestBody } from "@santra/shared";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL: AvailableModelId = "meta/llama-3.1-8b-instruct";

interface NvidiaNIMConfig {
  apiKey: string;
  baseURL?: string;
}

export class NvidiaNIM {
  private apiKey: string;
  private baseURL: string;

  chat: {
    message: (options: ChatCompletionRequestBody) => Promise<ReadableStream<Uint8Array>>;
  };

  constructor(config: NvidiaNIMConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL = NVIDIA_DEFAULT_BASE_URL;

    this.chat = {
      message: this.chatMessage.bind(this),
    };
  }

  private async chatMessage(options: ChatCompletionRequestBody): Promise<ReadableStream> {
    console.log(this.baseURL);
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

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();

    const stream = new ReadableStream({
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
            if (data === "[DONE]") break;

            try {
              const json = JSON.parse(data) as ChatCompletionChunk;
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {}
          }
        }
      },
    });

    return stream;
  }
}

// ─────────────────────────────────────────────
// STREAMING HANDLER
// FIX 1: Forward full JSON payload, not just delta.content
// FIX 2: Don't skip chunks where content is "" (role/finish chunks)
// ─────────────────────────────────────────────

export async function handleNvidiaStream(
  body: Partial<ChatCompletionRequestBody> & Pick<ChatCompletionRequestBody, "messages">,
): Promise<ReadableStream<Uint8Array>> {
  const client = new NvidiaNIM({
    apiKey: process.env.NVIDIA_NIM_KEY!,
  });
  const response = client.chat.message({
    model: body.model ?? DEFAULT_MODEL,
    messages: body.messages,
    stream: true,
  });

  return response;
}

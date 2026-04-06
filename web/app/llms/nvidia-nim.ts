import type { Message } from "@santra/shared";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DONE_SENTINEL = "[DONE]";
const SYSTEM_PROMPT =
  "You are a helpful, concise, and accurate assistant. Respond clearly and directly to the user's message.";

export const DEFAULT_MODEL = "meta/llama-3.1-8b-instruct";

export type NIMMessage = {
  role: string;
  content: string;
};

type NIMChatRequest = {
  model: string;
  messages: NIMMessage[];
  stream: boolean;
  temperature: number;
  max_tokens: number;
};

type NIMChunk = {
  id: string;
  choices: Array<{
    delta: { content?: string; role?: string };
    finish_reason: string | null;
  }>;
};

function sseLine(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function parseNIMLine(raw: string): NIMChunk | null {
  const line = raw.trim();
  if (!line.startsWith("data:")) return null;

  const payload = line.slice("data:".length).trim();
  if (!payload || payload === DONE_SENTINEL) return null;

  try {
    return JSON.parse(payload) as NIMChunk;
  } catch {
    return null;
  }
}

export function buildNimMessages(
  prompt: string,
  history: Message[],
): NIMMessage[] {
  const trimmedPrompt = prompt.trim();

  const mappedHistory: NIMMessage[] = history.map((message) => ({
    role: message.role,
    content: message.content,
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

export async function requestNimStream(params: {
  apiKey: string;
  model: string;
  messages: NIMMessage[];
}): Promise<Response> {
  const body: NIMChatRequest = {
    model: params.model,
    messages: params.messages,
    stream: true,
    temperature: 0.6,
    max_tokens: 1024,
  };

  return fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export function createWebStreamFromNimResponse(
  nimResponse: Response,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const nimReader = nimResponse.body?.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!nimReader) {
        controller.enqueue(
          encoder.encode(
            sseLine({
              type: "error",
              message: "NIM response body is empty.",
              statusCode: 502,
            }),
          ),
        );
        controller.close();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let closed = false;

      function close() {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }

      function enqueue(data: object) {
        if (!closed) {
          controller.enqueue(encoder.encode(sseLine(data)));
        }
      }

      try {
        enqueue({ type: "start" });

        while (true) {
          const { done, value } = await nimReader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const chunk = parseNIMLine(line);
            if (!chunk) continue;

            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              enqueue({ type: "delta", content: delta });
            }

            if (chunk.choices[0]?.finish_reason === "stop") {
              enqueue({ type: "text", text: fullContent });
              enqueue({ type: "finish" });
              close();
              return;
            }
          }
        }

        enqueue({ type: "text", text: fullContent });
        enqueue({ type: "finish" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "NIM stream processing failed.";
        console.error("[web] NIM stream error:", message);
        enqueue({ type: "error", message, statusCode: 500 });
      } finally {
        close();
      }
    },
  });
}

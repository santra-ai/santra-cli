import { Agent, fetch } from "undici";

import type { ChatCompletionChunk, ChatCompletionRequestBody } from "@santra/shared/types/types";
import { type AvailableModelId } from "@santra/shared";

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL: AvailableModelId = "qwen/qwq-32b";

const nvidiaAgent = new Agent({
  headersTimeout: 30_000,
  bodyTimeout: 120_000,
  connections: 1,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

function createChatCompletionsRequestBody(
  body: Partial<ChatCompletionRequestBody> & Pick<ChatCompletionRequestBody, "messages">,
): ChatCompletionRequestBody {
  return {
    model: body.model ?? DEFAULT_MODEL,
    messages: body.messages,
    stream: body.stream ?? false,
  };
}

async function createNvidiaRequest(body: ChatCompletionRequestBody) {
  const apiKey = process.env.NVIDIA_NIM_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_NIM_KEY is not configured");
  }

  return fetch(`${NVIDIA_DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    dispatcher: nvidiaAgent,
  });
}

export async function handleNvidiaStream(
  body: Partial<ChatCompletionRequestBody> & Pick<ChatCompletionRequestBody, "messages">,
): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> {
  const response = await createNvidiaRequest(
    createChatCompletionsRequestBody({
      ...body,
      stream: true,
    }),
  );

  if (!response.ok) {
    throw new Error(`NVIDIA NIM stream failed (${response.status}): ${await response.text()}`);
  }

  if (!response.body) {
    throw new Error("Failed to get NVIDIA response body");
  }

  const reader = response.body.getReader();

  return new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;

            const payload = line.replace(/^data:\s*/, "");
            if (payload === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            let chunk: ChatCompletionChunk;
            try {
              chunk = JSON.parse(payload) as ChatCompletionChunk;
            } catch {
              continue;
            }

            const text = chunk.choices[0]?.delta?.content;
            if (!text) continue;

            controller.enqueue(encoder.encode(`data: ${text}\n\n`));
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

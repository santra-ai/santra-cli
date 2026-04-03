import { Agent, fetch } from "undici";

import type { ChatCompletionChunk, ChatCompletionsRequest, ChatCompletionsResponse } from "./types";

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

const nvidiaAgent = new Agent({
  headersTimeout: 30_000,
  bodyTimeout: 120_000,
  connections: 1,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

function createChatCompletionsRequest(
  body: Partial<ChatCompletionsRequest> & Pick<ChatCompletionsRequest, "messages">,
): ChatCompletionsRequest {
  return {
    model: body.model ?? DEFAULT_MODEL,
    messages: body.messages,
    temperature: body.temperature,
    top_p: body.top_p,
    top_k: body.top_k,
    min_p: body.min_p,
    n: body.n,
    seed: body.seed,
    max_tokens: body.max_tokens ?? 800,
    stop: body.stop,
    response_format: body.response_format,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    logit_bias: body.logit_bias,
    stream: body.stream,
    stream_options: body.stream_options,
    tools: body.tools,
    tool_choice: body.tool_choice,
    parallel_tool_calls: body.parallel_tool_calls,
    user: body.user,
  };
}

async function createNvidiaRequest(body: ChatCompletionsRequest) {
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

export async function requestNvidiaChatCompletion(
  body: Partial<ChatCompletionsRequest> & Pick<ChatCompletionsRequest, "messages">,
): Promise<ChatCompletionsResponse> {
  return handleNvidiaNonStream(body);
}

export async function handleNvidiaNonStream(
  body: Partial<ChatCompletionsRequest> & Pick<ChatCompletionsRequest, "messages">,
): Promise<ChatCompletionsResponse> {
  const response = await createNvidiaRequest(createChatCompletionsRequest({ ...body, stream: false }));

  if (!response.ok) {
    throw new Error(`NVIDIA NIM request failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as ChatCompletionsResponse;
}

export async function handleNvidiaStream(
  body: Partial<ChatCompletionsRequest> & Pick<ChatCompletionsRequest, "messages">,
): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> {
  const response = await createNvidiaRequest(
    createChatCompletionsRequest({
      ...body,
      stream: true,
      stream_options: { include_usage: true },
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

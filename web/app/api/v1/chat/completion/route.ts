import { handleNvidiaStream } from "../../../../../llm-api/nvidia-nim";
import type { ChatCompletionRequestBody } from "@santra/shared";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatCompletionRequestBody> &
    Pick<ChatCompletionRequestBody, "messages">;

  const stream = await handleNvidiaStream(body);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

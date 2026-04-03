import { handleNvidiaStream } from "../../../../../llm-api/nvidia-nim";
import type { ChatCompletionsRequest } from "../../../../../llm-api/types";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatCompletionsRequest> &
    Pick<ChatCompletionsRequest, "messages">;

  const stream = await handleNvidiaStream(body);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

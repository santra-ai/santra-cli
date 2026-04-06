import type { NextRequest } from "next/server";
import { CompletionRequestSchema } from "@santra/shared";
import type { Message } from "@santra/shared";
import {
  DEFAULT_MODEL,
  buildNimMessages,
  requestNimStream,
  createWebStreamFromNimResponse,
} from "@llms/nvidia-nim";

// route handler

export async function POST(req: NextRequest): Promise<Response> {
  const apiKey = process.env["NVIDIA_API_KEY"] ?? "";
  const model = process.env["NVIDIA_MODEL"] ?? DEFAULT_MODEL;

  if (!apiKey) {
    return Response.json(
      { error: "NVIDIA_API_KEY is not configured." },
      { status: 500 },
    );
  }

  // validate

  let body: { prompt: string; messages?: Message[] };

  try {
    const raw = await req.json();
    const parsed = CompletionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // build massages

  const messages = buildNimMessages(body.prompt, body.messages ?? []);

  // calling nvidia nim

  let nimResponse: Response;

  try {
    nimResponse = await requestNimStream({ apiKey, model, messages });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Nvidia NIM.";
    return Response.json({ error: message }, { status: 502 });
  }

  if (!nimResponse.ok || !nimResponse.body) {
    const text = await nimResponse.text().catch(() => "");
    console.error(`[web] NIM error ${nimResponse.status}:`, text);
    return Response.json(
      { error: `Upstream error: ${nimResponse.status}` },
      { status: 502 },
    );
  }

  const stream = createWebStreamFromNimResponse(nimResponse);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

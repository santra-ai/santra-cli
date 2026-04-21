import type { NextRequest } from "next/server";
import { CompletionRequestSchema } from "@santra/shared";
import type { Message } from "@santra/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const enc = new TextEncoder();

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  "nvidia-nim": "https://integrate.api.nvidia.com/v1",
  ollama: "http://localhost:11434/v1",
};
const SANTRA_FALLBACK_MODEL = "meta/llama-3.1-8b-instruct";

// ─── OpenAI-compatible streaming ──────────────────────────────────────────────

function openAICompatStream(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[],
  fallbackModel?: string,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enq = (data: object) => {
        try { controller.enqueue(enc.encode(sse(data))); } catch { /* ignore */ }
      };
      const close = () => { try { controller.close(); } catch { /* ignore */ } };
      const invoke = (targetModel: string) =>
        fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages,
            stream: true,
            max_tokens: 16384,
            temperature: 0.1,
          }),
        });

      enq({ type: "start" });

      let resp: Response;
      let activeModel = model;
      try {
        resp = await invoke(activeModel);
      } catch (err) {
        enq({ type: "error", message: err instanceof Error ? err.message : "Network error" });
        close();
        return;
      }

      if (!resp.ok) {
        let detail = "";
        try {
          const body = await resp.json() as { error?: { message?: string }; message?: string; detail?: string };
          detail = body.error?.message ?? body.message ?? body.detail ?? "";
        } catch { detail = await resp.text().catch(() => ""); }

        const shouldRetryWithFallback =
          resp.status === 404 &&
          fallbackModel &&
          fallbackModel !== activeModel &&
          /function .*not found/i.test(detail);

        if (shouldRetryWithFallback) {
          try {
            activeModel = fallbackModel;
            resp = await invoke(activeModel);
          } catch (err) {
            enq({ type: "error", message: err instanceof Error ? err.message : "Network error" });
            close();
            return;
          }
        }
      }

      if (!resp.ok) {
        let detail = "";
        try {
          const body = await resp.json() as { error?: { message?: string }; message?: string; detail?: string };
          detail = body.error?.message ?? body.message ?? body.detail ?? "";
        } catch { detail = await resp.text().catch(() => ""); }
        const retryAfter = resp.headers.get("Retry-After");
        if (retryAfter) controller.enqueue(enc.encode(`retry: ${retryAfter}\n\n`));
        enq({ type: "error", message: `Provider error: ${resp.status}${detail ? ` — ${detail}` : ""}`, statusCode: resp.status });
        close();
        return;
      }

      if (!resp.body) {
        enq({ type: "error", message: "Empty response body" });
        close();
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";

      try {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break outer;
            try {
              const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) { full += delta; enq({ type: "delta", content: delta }); }
            } catch { /* skip malformed */ }
          }
        }

        enq({ type: "text", text: full });
        enq({ type: "finish" });
      } catch (err) {
        enq({ type: "error", message: err instanceof Error ? err.message : "Stream error" });
      } finally {
        await reader.cancel().catch(() => {});
        close();
      }
    },
  });
}

// ─── Anthropic Messages API streaming ─────────────────────────────────────────

function anthropicStream(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
): ReadableStream<Uint8Array> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const system = systemMessages.map((m) => m.content).join("\n\n").trim();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enq = (data: object) => {
        try { controller.enqueue(enc.encode(sse(data))); } catch { /* ignore */ }
      };
      const close = () => { try { controller.close(); } catch { /* ignore */ } };

      enq({ type: "start" });

      let resp: Response;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            messages: nonSystem,
            ...(system ? { system } : {}),
            max_tokens: 16000,
            stream: true,
          }),
        });
      } catch (err) {
        enq({ type: "error", message: err instanceof Error ? err.message : "Network error" });
        close();
        return;
      }

      if (!resp.ok) {
        let detail = "";
        try {
          const body = await resp.json() as { error?: { message?: string } };
          detail = body.error?.message ?? "";
        } catch { detail = await resp.text().catch(() => ""); }
        enq({ type: "error", message: `Anthropic error: ${resp.status}${detail ? ` — ${detail}` : ""}`, statusCode: resp.status });
        close();
        return;
      }

      if (!resp.body) {
        enq({ type: "error", message: "Empty response body" });
        close();
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            try {
              const ev = JSON.parse(data) as {
                type: string;
                delta?: { type?: string; text?: string };
              };
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
                full += ev.delta.text;
                enq({ type: "delta", content: ev.delta.text });
              }
            } catch { /* skip */ }
          }
        }

        enq({ type: "text", text: full });
        enq({ type: "finish" });
      } catch (err) {
        enq({ type: "error", message: err instanceof Error ? err.message : "Stream error" });
      } finally {
        await reader.cancel().catch(() => {});
        close();
      }
    },
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const accessMode = req.headers.get("x-santra-access-mode") ?? "";
  const provider = req.headers.get("x-santra-provider") ?? "";
  const userApiKey = req.headers.get("x-santra-key") ?? "";
  const fallbackApiKey = process.env["NVIDIA_API_KEY"] ?? "";
  const apiKey =
    accessMode === "santra" || !userApiKey ? fallbackApiKey : userApiKey;
  const hostedModel = process.env["NVIDIA_MODEL"] ?? SANTRA_FALLBACK_MODEL;
  const model =
    accessMode === "santra"
      ? hostedModel
      : req.headers.get("x-santra-model") ?? hostedModel;
  const customBaseUrl = req.headers.get("x-santra-base-url") ?? "";
  const effectiveProvider =
    accessMode === "santra" || !provider
      ? (process.env["NVIDIA_PROVIDER"] ?? "nvidia-nim")
      : provider;

  if (!apiKey) {
    return Response.json(
      {
        error:
          accessMode === "santra" || !userApiKey
            ? "Santra hosted access is not configured on the server."
            : "No API key provided. Run /setup in the CLI to configure your provider.",
      },
      { status: 401 },
    );
  }

  let body: { prompt: string; messages?: Message[] };
  try {
    const raw = await req.json();
    const parsed = CompletionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const history = body.messages ?? [];
  const messages: { role: string; content: string }[] = history.length > 0
    ? history.map((m) => ({ role: m.role, content: m.content }))
    : [{ role: "user", content: body.prompt }];

  let stream: ReadableStream<Uint8Array>;

  if (effectiveProvider === "anthropic") {
    stream = anthropicStream(apiKey, model, messages);
  } else {
    const baseUrl =
      customBaseUrl ||
      PROVIDER_BASE_URLS[effectiveProvider] ||
      PROVIDER_BASE_URLS["nvidia-nim"]!;
    stream = openAICompatStream(
      apiKey,
      baseUrl,
      model,
      messages,
      accessMode === "santra" && effectiveProvider === "nvidia-nim"
        ? SANTRA_FALLBACK_MODEL
        : undefined,
    );
  }

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
      "Access-Control-Allow-Headers": "Content-Type, x-santra-access-mode, x-santra-provider, x-santra-key, x-santra-model, x-santra-base-url",
    },
  });
}

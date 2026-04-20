import type { NextRequest } from "next/server";
import {
  completeLoginSession,
  readLoginSession,
  type LoginProvider,
} from "@santra/shared";

export const runtime = "nodejs";

const PROVIDERS: readonly LoginProvider[] = [
  "anthropic",
  "openai",
  "nvidia-nim",
  "groq",
  "together",
  "ollama",
];

function isProvider(value: string): value is LoginProvider {
  return PROVIDERS.includes(value as LoginProvider);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const session = readLoginSession(token);

  if (!session) {
    return Response.json({ error: "Login session not found." }, { status: 404 });
  }

  return Response.json({
    token: session.token,
    createdAt: session.createdAt,
    status: session.status,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  let body: {
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  try {
    body = (await req.json()) as {
      provider?: string;
      model?: string;
      apiKey?: string;
    };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const provider = (body.provider ?? "").trim();
  const model = (body.model ?? "").trim();
  const apiKey = (body.apiKey ?? "").trim();

  if (!isProvider(provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }

  if (!model) {
    return Response.json({ error: "Model is required." }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({ error: "API key is required." }, { status: 400 });
  }

  const session = completeLoginSession(token, {
    provider,
    model,
    apiKey,
  });

  if (!session) {
    return Response.json({ error: "Login session not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    status: session.status,
  });
}

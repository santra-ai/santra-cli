import type { NextRequest } from "next/server";
import { getSession, updateSession } from "@/app/lib/sessions";
import { AuthProvider } from "@santra/shared";

export const runtime = "nodejs";

const PROVIDERS: readonly AuthProvider[] = ["github", "google"];

function isProvider(value: string): value is AuthProvider {
  return PROVIDERS.includes(value as AuthProvider);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const session = getSession(token);

  if (!session) {
    return Response.json({ error: "Login session not found." }, { status: 404 });
  }

  return Response.json({
    token: session.token,
    createdAt: session.createdAt,
    status: session.status,
    provider: session.provider,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  let body: {
    provider?: string;
  };

  try {
    body = (await req.json()) as {
      provider?: string;
    };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const provider = (body.provider ?? "").trim();

  if (!isProvider(provider)) {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }

  const session = updateSession(token, provider);

  if (!session) {
    return Response.json({ error: "Login session not found." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    status: session.status,
  });
}

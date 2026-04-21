import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/app/lib/sessions";

export const runtime = "nodejs";

/**
 * CLI calls this to register a new login session token
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing token." },
        { status: 400 }
      );
    }

    const session = createSession(token);
    return NextResponse.json({
      ok: true,
      token: session.token,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }
}

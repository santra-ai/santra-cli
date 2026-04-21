import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  // The 'state' param is echoed back by GitHub and contains the CLI session token.
  const token = searchParams.get("state");
  const code = searchParams.get("code");

  if (!token || !code) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const clientId = process.env["GITHUB_CLIENT_ID"];
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"];

  try {
    // Exchange the code for a GitHub access token to verify the user actually signed in.
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const body = await response.json();

    if (!body.access_token) {
      console.error("GitHub OAuth exchange failed:", body);
      return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
    }

    // Success! Redirect the user to the completion page
    return NextResponse.redirect(
      new URL(`/login/${token}/complete?provider=github`, req.url)
    );
  } catch (error) {
    console.error("Error during GitHub OAuth exchange:", error);
    return NextResponse.redirect(new URL("/?error=internal_error", req.url));
  }
}

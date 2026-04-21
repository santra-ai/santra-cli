import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/app/lib/sessions";
import { LoginSessionClient } from "./LoginSessionClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect CLI Session — Santra",
  description: "Finish a session-specific Santra CLI sign-in flow.",
};

export default async function LoginTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = getSession(token);

  if (!session) {
    notFound();
  }

  const webBaseUrl = process.env["NEXT_PUBLIC_SANTRA_WEB_BASE_URL"] || "http://localhost:3000";
  const callbackUrl = `${webBaseUrl}/api/auth/github/callback`;
  const githubClientId = process.env["GITHUB_CLIENT_ID"];

  // If we have a client ID, we can build the correct GitHub URL automatically
  const fallbackGithubUrl = githubClientId 
    ? `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=user:email`
    : process.env["NEXT_PUBLIC_SANTRA_GITHUB_LOGIN_URL"];

  return (
    <LoginSessionClient
      token={token}
      githubLoginUrl={fallbackGithubUrl}
      githubClientId={githubClientId}
    />
  );
}

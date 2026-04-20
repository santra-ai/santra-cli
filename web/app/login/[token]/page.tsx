import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readLoginSession } from "@santra/shared";
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
  const session = readLoginSession(token);

  if (!session) {
    notFound();
  }

  return <LoginSessionClient token={token} />;
}

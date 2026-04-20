"use client";

import { useMemo, useState } from "react";
import { buildWebUrl } from "@/app/lib/base-url";

type AuthProvider = "github" | "google";

function withAuthParams(
  url: string | undefined,
  token: string,
  provider: AuthProvider,
  clientId?: string,
): string | null {
  if (!url) return null;

  const callback = buildWebUrl(`/login/${token}/complete?provider=${provider}`);

  try {
    const next = new URL(url);
    
    // Auto-inject client_id if we have it, replacing any placeholder like 'YOUR_CLIENT_ID'
    if (clientId) {
      next.searchParams.set("client_id", clientId);
    }

    // For direct OAuth providers like GitHub, we must pass the token in the 'state' parameter 
    // because they ignore unrecognized query params.
    next.searchParams.set("state", token);
    
    // Also keep the existing custom params in case a different proxy/backend uses them
    next.searchParams.set("santra_cli_token", token);
    next.searchParams.set("provider", provider);
    next.searchParams.set("redirect_to", callback);
    next.searchParams.set("return_to", callback);
    next.searchParams.set("next", callback);
    return next.toString();
  } catch {
    return null;
  }
}

export function LoginSessionClient({
  token,
  githubLoginUrl,
  githubClientId,
}: {
  token: string;
  githubLoginUrl?: string;
  githubClientId?: string;
}) {
  const [busy, setBusy] = useState<AuthProvider | null>(null);

  const githubUrl = useMemo(
    () => withAuthParams(githubLoginUrl, token, "github", githubClientId),
    [token, githubLoginUrl, githubClientId],
  );

  function begin(url: string | null, provider: AuthProvider) {
    if (!url) return;
    setBusy(provider);
    window.location.href = url;
  }

  return (
    <section style={{ padding: "4rem 1.5rem 5rem" }}>
      <div className="container-sm" style={{ maxWidth: 620 }}>
        <p className="overline" style={{ marginBottom: "1rem" }}>
          Santra CLI
        </p>
        <h1 className="title" style={{ marginBottom: "0.9rem" }}>
          Sign in to continue
        </h1>
        <p
          style={{
            color: "var(--text-2)",
            lineHeight: 1.7,
            marginBottom: "2rem",
            maxWidth: 520,
          }}
        >
          This browser step is only for authentication. After sign-in, return to
          the terminal and run <code>/setup</code> to choose your provider,
          model, and API key locally.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            className="btn btn-fill"
            onClick={() => begin(githubUrl, "github")}
            disabled={!githubUrl || busy !== null}
            style={{
              width: "100%",
              justifyContent: "center",
              opacity: !githubUrl || busy ? 0.6 : 1,
            }}
          >
            {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
          </button>
        </div>

        <p
          style={{
            color: "var(--text-2)",
            lineHeight: 1.7,
            marginTop: "1.25rem",
          }}
        >
          Configure your GitHub OAuth URL in the web environment to enable sign-in.
        </p>
      </div>
    </section>
  );
}

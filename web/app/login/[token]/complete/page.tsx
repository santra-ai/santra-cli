"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type AuthProvider = "github" | "google";

export default function LoginCompletePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let active = true;

    (async () => {
      const { token } = await params;
      const provider = (searchParams.get("provider") ?? "").trim() as AuthProvider;

      if (provider !== "github" && provider !== "google") {
        if (active) setMessage("Missing sign-in provider.");
        return;
      }

      try {
        const response = await fetch(`/api/v1/login-sessions/${token}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider }),
        });

        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          if (active) {
            setMessage(body.error ?? "Could not finish sign-in.");
          }
          return;
        }

        if (active) {
          setMessage("Authentication complete. Return to the terminal.");
          setTimeout(() => {
            window.close();
          }, 1200);
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Could not finish sign-in.",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [params, searchParams]);

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div className="container-sm" style={{ maxWidth: 560 }}>
        <p className="overline" style={{ marginBottom: "1rem" }}>
          Santra CLI
        </p>
        <h1 className="title" style={{ marginBottom: "1rem" }}>
          {message}
        </h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7 }}>
          After you are back in the terminal, run <code>/setup</code> to choose
          your provider, model, and API key locally.
        </p>
      </div>
    </section>
  );
}

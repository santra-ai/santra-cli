"use client";

import { useMemo, useState } from "react";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-6" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o" },
  {
    id: "nvidia-nim",
    label: "Nvidia NIM",
    defaultModel: "meta/llama-3.1-70b-instruct",
  },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile" },
  {
    id: "together",
    label: "Together",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  },
  { id: "ollama", label: "Ollama", defaultModel: "qwen2.5-coder:32b" },
] as const;

function withToken(url: string | undefined, token: string): string | null {
  if (!url) return null;
  try {
    const next = new URL(url);
    next.searchParams.set("santra_cli_token", token);
    return next.toString();
  } catch {
    return null;
  }
}

export function LoginSessionClient({ token }: { token: string }) {
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>(
    "openai",
  );
  const [model, setModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const providerOptions = useMemo(() => PROVIDERS, []);
  const googleUrl = withToken(
    process.env["NEXT_PUBLIC_SANTRA_GOOGLE_LOGIN_URL"],
    token,
  );
  const githubUrl = withToken(
    process.env["NEXT_PUBLIC_SANTRA_GITHUB_LOGIN_URL"],
    token,
  );
  const keysUrl = withToken(process.env["NEXT_PUBLIC_SANTRA_KEYS_URL"], token);

  async function submitManualKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim() || !model.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/v1/login-sessions/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          apiKey: apiKey.trim(),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not save this login session.");
        return;
      }

      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this login session.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ padding: "4rem 1.5rem 5rem" }}>
      <div className="container-sm" style={{ maxWidth: 680 }}>
        <p className="overline" style={{ marginBottom: "1rem" }}>
          Santra CLI
        </p>
        <h1 className="title" style={{ marginBottom: "0.9rem" }}>
          Connect this CLI session
        </h1>
        <p
          style={{
            color: "var(--text-2)",
            lineHeight: 1.7,
            marginBottom: "2rem",
            maxWidth: 560,
          }}
        >
          This link belongs to one terminal session. Complete sign-in here and
          <code style={{ marginLeft: 6 }}>santra-cli</code> will continue on its
          own.
        </p>

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: "2rem",
          }}
        >
          <a
            href={googleUrl ?? "#"}
            aria-disabled={!googleUrl}
            style={{
              pointerEvents: googleUrl ? "auto" : "none",
              opacity: googleUrl ? 1 : 0.55,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.9rem 1rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Continue with Google
          </a>
          <a
            href={githubUrl ?? "#"}
            aria-disabled={!githubUrl}
            style={{
              pointerEvents: githubUrl ? "auto" : "none",
              opacity: githubUrl ? 1 : 0.55,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.9rem 1rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Continue with GitHub
          </a>
          <a
            href={keysUrl ?? "#"}
            aria-disabled={!keysUrl}
            style={{
              pointerEvents: keysUrl ? "auto" : "none",
              opacity: keysUrl ? 1 : 0.55,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.9rem 1rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Manage API Keys
          </a>
        </div>

        {done ? (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1.25rem",
            }}
          >
            <p style={{ color: "var(--text)", marginBottom: "0.4rem" }}>
              This CLI session is connected.
            </p>
            <p style={{ color: "var(--text-2)", lineHeight: 1.7 }}>
              Return to the terminal. Santra will pick this up automatically.
            </p>
          </div>
        ) : (
          <form onSubmit={submitManualKey}>
            <div
              style={{
                display: "grid",
                gap: "1rem",
                borderTop: "1px solid var(--border)",
                paddingTop: "1.25rem",
              }}
            >
              <div>
                <label
                  htmlFor="provider"
                  style={{
                    display: "block",
                    marginBottom: "0.45rem",
                    color: "var(--text-2)",
                  }}
                >
                  Provider
                </label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as (typeof PROVIDERS)[number]["id"];
                    setProvider(nextProvider);
                    const nextDefault =
                      PROVIDERS.find((entry) => entry.id === nextProvider)
                        ?.defaultModel ?? "";
                    setModel(nextDefault);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-2)",
                    color: "var(--text)",
                    padding: "0.75rem 0.85rem",
                  }}
                >
                  {providerOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="model"
                  style={{
                    display: "block",
                    marginBottom: "0.45rem",
                    color: "var(--text-2)",
                  }}
                >
                  Model
                </label>
                <input
                  id="model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-2)",
                    color: "var(--text)",
                    padding: "0.75rem 0.85rem",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="api-key"
                  style={{
                    display: "block",
                    marginBottom: "0.45rem",
                    color: "var(--text-2)",
                  }}
                >
                  API key
                </label>
                <input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-2)",
                    color: "var(--text)",
                    padding: "0.75rem 0.85rem",
                  }}
                />
              </div>

              {error ? (
                <p style={{ color: "var(--red)", lineHeight: 1.6 }}>{error}</p>
              ) : null}

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={submitting || !apiKey.trim() || !model.trim()}
                  className="btn btn-fill"
                >
                  {submitting ? "Connecting…" : "Connect this session"}
                </button>
                <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                  Base URLs stay backend-managed through your
                  <code style={{ marginLeft: 6 }}>/api/v1/completions</code>
                  route.
                </p>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

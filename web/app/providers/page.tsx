import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "../lib/content";

export const metadata: Metadata = {
  title: "Providers & Models",
  description:
    "Santra works with Anthropic, OpenAI, Nvidia NIM, Groq, Ollama, LM Studio, and any OpenAI-compatible API.",
};

export default function ProvidersPage() {
  return (
    <section style={{ padding: "4rem 1.5rem" }}>
      <div className="container-sm">
        <p className="overline" style={{ marginBottom: "1rem" }}>Provider support</p>
        <h1 className="title" style={{ marginBottom: "0.75rem" }}>
          Your model. Your rules.
        </h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 480, marginBottom: "3rem" }}>
          Santra is provider-agnostic. Any server that speaks the OpenAI
          chat-completions protocol works. Set one environment variable and
          you&apos;re connected.
        </p>

        {/* First-class */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "1.25rem", color: "var(--text-2)" }}>
          First-class support
        </h2>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: "3rem",
          }}
        >
          {FIRST_CLASS.map((p, i) => (
            <div
              key={p.name}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                borderBottom: i < FIRST_CLASS.length - 1 ? "1px solid var(--border)" : "none",
              }}
              className="provider-row"
            >
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderRight: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{p.name}</span>
                {p.tag && (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.65rem",
                      color: "var(--orange)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {p.tag}
                  </span>
                )}
              </div>
              <div style={{ padding: "1rem 1.25rem" }}>
                <div style={{ color: "var(--text-2)", fontSize: "0.85rem", marginBottom: "0.6rem", lineHeight: 1.6 }}>
                  {p.desc}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {p.models.map((m) => (
                    <span
                      key={m}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "0.7rem",
                        background: "var(--bg-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 3,
                        padding: "0.1em 0.45em",
                        color: "var(--text-2)",
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @media (max-width: 520px) {
            .provider-row { grid-template-columns: 1fr !important; }
            .provider-row > div:first-child { border-right: none !important; border-bottom: 1px solid var(--border); }
          }
        `}</style>

        {/* OpenAI-compatible */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.5rem", color: "var(--text-2)" }}>
          OpenAI-compatible
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "1.25rem" }}>
          Any server implementing{" "}
          <code>POST /v1/chat/completions</code> works with Santra.
          Set <code>OPENAI_BASE_URL</code> to your server.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "3rem" }}>
          {COMPAT.map((name) => (
            <span
              key={name}
              style={{
                fontFamily: "var(--mono)",
                fontSize: "0.75rem",
                padding: "0.25rem 0.65rem",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-2)",
              }}
            >
              {name}
            </span>
          ))}
        </div>

        {/* Nvidia NIM deep-dive */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.5rem", color: "var(--text-2)" }}>
          Nvidia NIM — on-prem inference
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "1.25rem", maxWidth: 480 }}>
          Nvidia NIM lets you deploy frontier models on your own hardware with
          an OpenAI-compatible API surface. Ideal for data-sovereignty and
          regulated environments.
        </p>
        <div className="code-block" style={{ marginBottom: "3rem" }}>
          <div className="c-gray"># Nvidia-hosted (cloud)</div>
          <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1</span></div>
          <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=nvapi-...</span></div>
          <div><span className="c-green">$ </span><span className="c-text">export SANTRA_MODEL=meta/llama-3.1-405b-instruct</span></div>
          <br />
          <div className="c-gray"># Self-hosted NIM</div>
          <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=http://nim.corp.internal:8000/v1</span></div>
          <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=your-nim-key</span></div>
        </div>

        {/* Local inference */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.5rem", color: "var(--text-2)" }}>
          Fully offline — Ollama / LM Studio
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "1.25rem" }}>
          No internet required for inference. Run locally and nothing leaves your machine.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "2rem" }} className="two-col">
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>Ollama</div>
            <div className="code-block">
              <div><span className="c-green">$ </span><span className="c-text">ollama pull llama3.1:70b</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=http://localhost:11434/v1</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=ollama</span></div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>LM Studio</div>
            <div className="code-block">
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=http://localhost:1234/v1</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=lm-studio</span></div>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 520px) {
            .two-col { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <Link href={LINKS.install} className="btn btn-fill">
          Install guide →
        </Link>
      </div>
    </section>
  );
}

const FIRST_CLASS = [
  {
    name: "Anthropic",
    tag: "recommended",
    desc: "Claude models have excellent code comprehension and instruction following. claude-sonnet-4-6 is the default recommended model.",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
  },
  {
    name: "OpenAI",
    tag: null,
    desc: "GPT-4o and o1 series with strong general coding capabilities.",
    models: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
  },
  {
    name: "Nvidia NIM",
    tag: "enterprise",
    desc: "OpenAI-compatible endpoint for Nvidia-hosted or self-hosted LLaMA, Mistral, and Nemotron models.",
    models: ["meta/llama-3.1-405b-instruct", "mistralai/mistral-large", "nvidia/nemotron-4-340b"],
  },
];

const COMPAT = [
  "Groq", "Together AI", "Fireworks AI", "Perplexity",
  "Anyscale", "DeepInfra", "Mistral AI", "Cohere",
  "Ollama", "LM Studio", "vLLM", "text-generation-webui",
];

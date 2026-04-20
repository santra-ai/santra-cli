import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "../lib/content";

export const metadata: Metadata = {
  title: "Install",
  description: "Install santra-cli via npm. No account required — bring your own API key.",
};

export default function InstallPage() {
  return (
    <section style={{ padding: "4rem 1.5rem" }}>
      <div className="container-sm">
        <p className="overline" style={{ marginBottom: "1rem" }}>Get started</p>
        <h1 className="title" style={{ marginBottom: "0.75rem" }}>Install Santra</h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 480, marginBottom: "3rem" }}>
          Santra ships as a standard npm package. No proprietary installer,
          no sign-up, no account wall.
        </p>

        {/* Step 1 */}
        <Step n={1} title="Install globally">
          <div className="code-block">
            <div className="c-gray"># npm</div>
            <div><span className="c-green">$ </span><span className="c-text">npm install -g santra-cli</span></div>
            <br />
            <div className="c-gray"># pnpm</div>
            <div><span className="c-green">$ </span><span className="c-text">pnpm add -g santra-cli</span></div>
            <br />
            <div className="c-gray"># verify</div>
            <div><span className="c-green">$ </span><span className="c-text">santra --version</span></div>
            <div><span className="c-muted">santra v1.0.0</span></div>
          </div>
          <Note>Requires Node.js 18+.</Note>
        </Step>

        {/* Step 2 */}
        <Step n={2} title="Set your provider key">
          <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: "1rem", lineHeight: 1.65 }}>
            Santra reads standard environment variables. Set one for your
            preferred provider and you&apos;re done.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ProviderBlock name="Anthropic (Claude models)">
              <div><span className="c-green">$ </span><span className="c-text">export ANTHROPIC_API_KEY=sk-ant-...</span></div>
            </ProviderBlock>

            <ProviderBlock name="OpenAI">
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=sk-...</span></div>
            </ProviderBlock>

            <ProviderBlock name="Nvidia NIM">
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=nvapi-...</span></div>
            </ProviderBlock>

            <ProviderBlock name="Ollama (local — no key needed)">
              <div><span className="c-green">$ </span><span className="c-text">ollama serve</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=http://localhost:11434/v1</span></div>
              <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=ollama</span></div>
            </ProviderBlock>
          </div>

          <p style={{ color: "var(--text-2)", fontSize: "0.82rem", marginTop: "0.75rem" }}>
            Any OpenAI-compatible server works. See{" "}
            <Link href={LINKS.providers} style={{ color: "var(--orange)" }}>
              all providers →
            </Link>
          </p>
        </Step>

        {/* Step 3 */}
        <Step n={3} title="Run in your project">
          <div className="code-block">
            <div><span className="c-green">$ </span><span className="c-text">cd ~/my-project</span></div>
            <div><span className="c-green">$ </span><span className="c-text">santra</span></div>
            <br />
            <div><span className="c-orange">● santra</span><span className="c-muted"> / my-project</span></div>
            <div><span className="c-muted">  ready for input…</span></div>
          </div>
        </Step>

        {/* BYOK note */}
        <div
          style={{
            marginTop: "2rem",
            padding: "1.25rem",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 7,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.4rem" }}>
            Bring your own key — what it means
          </div>
          <p style={{ color: "var(--text-2)", fontSize: "0.85rem", lineHeight: 1.65 }}>
            Santra sends requests directly from your machine to your chosen provider.
            No Santra-owned proxy, no usage tracking, no markup. You pay your
            provider at their published rate. Your key never leaves your machine.
          </p>
        </div>

        <div style={{ marginTop: "2rem" }}>
          <Link href={LINKS.docs} className="btn btn-outline">
            Read the docs →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "3rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: "0.75rem",
            color: "var(--text-3)",
            minWidth: 20,
          }}
        >
          {n}.
        </span>
        <h2 style={{ fontWeight: 600, fontSize: "1.05rem", letterSpacing: "-0.02em" }}>{title}</h2>
      </div>
      <div style={{ paddingLeft: "1.75rem" }}>{children}</div>
    </div>
  );
}

function ProviderBlock({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.72rem",
          color: "var(--text-3)",
          fontFamily: "var(--mono)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: "0.4rem",
        }}
      >
        {name}
      </div>
      <div className="code-block">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: "var(--text-3)",
        fontSize: "0.78rem",
        marginTop: "0.6rem",
        fontFamily: "var(--mono)",
      }}
    >
      {children}
    </p>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "../../lib/content";

export const metadata: Metadata = {
  title: "Santra vs Claude Code",
  description:
    "A concrete, honest comparison of Santra and Claude Code — what each does well and where they differ.",
};

export default function ComparePage() {
  return (
    <section style={{ padding: "4rem 1.5rem" }}>
      <div className="container-sm">
        <p className="overline" style={{ marginBottom: "1rem" }}>Comparison</p>
        <h1 className="title" style={{ marginBottom: "0.75rem" }}>
          Santra vs Claude Code
        </h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 520, marginBottom: "1rem" }}>
          Both are CLI coding agents with tool use, file editing, and multi-step
          reasoning. The difference is about openness and control.
        </p>
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: "0.82rem",
            color: "var(--text-2)",
            marginBottom: "3rem",
            maxWidth: 520,
          }}
        >
          This comparison reflects our best understanding as of April 2026.
          If anything is inaccurate,{" "}
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer" style={{ color: "var(--orange)" }}>
            open an issue
          </a>
          .
        </div>

        {/* What each is good at */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: "3rem",
          }}
          className="strengths-grid"
        >
          <div style={{ padding: "1.5rem", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              Claude Code is excellent at
            </div>
            <ul style={{ color: "var(--text-2)", fontSize: "0.85rem", lineHeight: 1.8, paddingLeft: "1rem" }}>
              <li>Polished, production-ready agentic UX</li>
              <li>Deep multi-file codebase understanding</li>
              <li>MCP server ecosystem integration</li>
              <li>Tight Anthropic model integration</li>
              <li>Seamless git workflow</li>
            </ul>
          </div>
          <div style={{ padding: "1.5rem" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.9rem",
                marginBottom: "0.75rem",
                color: "var(--orange)",
              }}
            >
              Santra is built for
            </div>
            <ul style={{ color: "var(--text-2)", fontSize: "0.85rem", lineHeight: 1.8, paddingLeft: "1rem" }}>
              <li>Provider freedom — any model, any host</li>
              <li>On-prem / air-gapped inference via Nvidia NIM</li>
              <li>Bring-your-own-key economics</li>
              <li>Scriptable, pipeable CLI workflows</li>
              <li>MIT-licensed, forkable codebase</li>
            </ul>
          </div>
        </div>

        <style>{`
          @media (max-width: 560px) {
            .strengths-grid { grid-template-columns: 1fr !important; }
            .strengths-grid > div:first-child { border-right: none !important; border-bottom: 1px solid var(--border); }
          }
        `}</style>

        {/* Table */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "1rem", color: "var(--text-2)" }}>
          Feature comparison
        </h2>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            overflowX: "auto",
            marginBottom: "3rem",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-2)" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "var(--text-3)", fontWeight: 600, fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase", width: "28%" }}>Feature</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "var(--orange)", fontWeight: 600, fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase", width: "36%" }}>Santra</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "var(--text-3)", fontWeight: 600, fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase", width: "36%" }}>Claude Code</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.feature}
                  style={{ borderBottom: i < ROWS.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600, fontSize: "0.82rem", color: "var(--text)" }}>
                    {row.feature}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--text-2)" }}>
                    <Status v={row.s} /> {row.santra}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--text-2)" }}>
                    <Status v={row.c} /> {row.claude}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "3rem", flexWrap: "wrap" }}>
          {[
            { sym: "✓", col: "var(--green)", label: "Yes / strong" },
            { sym: "◑", col: "var(--orange)", label: "Partial" },
            { sym: "✗", col: "var(--red)", label: "No" },
          ].map(({ sym, col, label }) => (
            <span key={label} style={{ fontSize: "0.78rem", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: col, fontWeight: 700 }}>{sym}</span> {label}
            </span>
          ))}
        </div>

        {/* When to choose */}
        <h2 style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "1.25rem", color: "var(--text-2)" }}>
          Which should you use?
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {CHOOSE.map((item, i) => (
            <div
              key={item.head}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: "1rem",
                padding: "1.25rem 0",
                borderBottom: i < CHOOSE.length - 1 ? "1px solid var(--border)" : "none",
              }}
              className="choose-row"
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-3)", paddingTop: "0.1rem" }}>
                {item.head}
              </div>
              <div style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.65 }}>
                {item.body}
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @media (max-width: 520px) {
            .choose-row { grid-template-columns: 1fr !important; gap: 0.2rem !important; }
          }
        `}</style>

        <div style={{ marginTop: "3rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link href={LINKS.install} className="btn btn-fill">Try Santra →</Link>
          <Link href={LINKS.providers} className="btn btn-outline">Browse providers</Link>
        </div>
      </div>
    </section>
  );
}

function Status({ v }: { v: boolean | "partial" }) {
  if (v === true)      return <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ </span>;
  if (v === "partial") return <span style={{ color: "var(--orange)", fontWeight: 700 }}>◑ </span>;
  return                      <span style={{ color: "var(--red)", fontWeight: 700 }}>✗ </span>;
}

const ROWS: { feature: string; santra: string; claude: string; s: boolean | "partial"; c: boolean | "partial" }[] = [
  { feature: "Provider choice",      santra: "Anthropic, OpenAI, NIM, any OpenAI-compat API", claude: "Anthropic models only",                     s: true,      c: false     },
  { feature: "Bring your own key",   santra: "Yes — set one env var, direct to provider",     claude: "Subscription; no external key support",      s: true,      c: false     },
  { feature: "On-prem / air-gapped", santra: "Via Nvidia NIM or any self-hosted server",      claude: "Not supported",                              s: true,      c: false     },
  { feature: "Open source",          santra: "MIT license",                                   claude: "Proprietary",                                s: true,      c: false     },
  { feature: "npm install",          santra: "npm install -g santra-cli, no account",         claude: "Separate installer, account required",        s: true,      c: "partial" },
  { feature: "Multi-agent swarm",    santra: "Orchestrator spawns specialists dynamically",   claude: "Single agent with tool use",                 s: true,      c: "partial" },
  { feature: "23 built-in tools",    santra: "File ops, search, shell, web, agent control",  claude: "Comparable tool set",                        s: true,      c: true      },
  { feature: "Change approval",      santra: "Diff shown, user approves before apply",        claude: "Yes — similar approval flow",                s: true,      c: true      },
  { feature: "Agentic code quality", santra: "Strong — multi-agent review loop",              claude: "Excellent — polished, battle-tested",         s: "partial", c: true      },
  { feature: "IDE integration",      santra: "CLI only",                                      claude: "VS Code, JetBrains extensions",              s: false,     c: true      },
  { feature: "MCP servers",          santra: "Not yet",                                       claude: "Full MCP ecosystem",                         s: false,     c: true      },
  { feature: "Scriptable / CI",      santra: "Standard process — pipe stdin/stdout",          claude: "Limited non-interactive support",             s: true,      c: "partial" },
];

const CHOOSE = [
  {
    head: "Choose Claude Code if…",
    body: "You want the most polished agentic coding experience, you rely on Anthropic models exclusively, you use MCP servers, or you need IDE integration.",
  },
  {
    head: "Choose Santra if…",
    body: "You want to use Nvidia NIM, Ollama, Groq, or another provider; you need on-prem inference; you're cost-sensitive and want to pick your own key; or you want an MIT-licensed foundation you can fork and extend.",
  },
];

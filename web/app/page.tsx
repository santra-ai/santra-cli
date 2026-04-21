import type { Metadata } from "next";
import Link from "next/link";
import { LINKS, INSTALL_CMD } from "./lib/content";
import SantraIcon from "./components/Logo";

export const metadata: Metadata = {
  title: "Santra — repository-aware coding agent for the terminal",
  description:
    "A repository-aware coding agent for the terminal. Bring your own key, run any model, and delegate tasks across a swarm of specialised sub-agents.",
};

export default function HomePage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: "6rem 1.5rem 5rem" }}>
        <div className="container-sm">
          <p className="overline" style={{ marginBottom: "1.5rem" }}>
            open source · MIT · npm
          </p>

          <h1 className="display" style={{ marginBottom: "1.5rem" }}>
            A coding agent
            <br />
            that lives in your
            <br />
            <span style={{ color: "var(--orange)" }}>terminal.</span>
          </h1>

          <p
            style={{
              color: "var(--text-2)",
              fontSize: "1.05rem",
              lineHeight: 1.7,
              maxWidth: 480,
              marginBottom: "2.5rem",
            }}
          >
            Santra is a repository-aware coding assistant. It reads your codebase,
            reasons about it, and makes precise edits — using whichever model you
            choose.
          </p>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link href={LINKS.install} className="btn btn-fill">
              npm install -g santra-cli
            </Link>
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
            >
              GitHub →
            </a>
          </div>
        </div>
      </section>

      {/* ── TUI mock ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "0 1.5rem 6rem" }}>
        <div className="container-sm">
          <div className="tui">
            {/* chrome bar */}
            <div className="tui-chrome">
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}>
                <SantraIcon size={16} />
                <span style={{ color: "var(--orange)" }}>santra</span>
                <span style={{ color: "var(--text-3)", fontWeight: 400 }}> / my-project</span>
              </span>
              <span style={{ color: "var(--text-3)", fontSize: "0.72rem" }}>
                ↑↓ scroll · Enter send · / commands · F2 select · Esc stop
              </span>
            </div>

            {/* body */}
            <div className="tui-body">
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.25rem", color: "var(--text)" }}>
                  Welcome to Santra
                </div>
                <div style={{ color: "var(--text-2)" }}>
                  Santra is a repository-aware coding assistant for the terminal.
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div>
                  <span style={{ color: "var(--text-3)" }}>docs   </span>
                  <span style={{ color: "var(--text-3)" }}>→ </span>
                  <span style={{ color: "var(--orange)" }}>santra-cli.dev/docs</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-3)" }}>github </span>
                  <span style={{ color: "var(--text-3)" }}>→ </span>
                  <span style={{ color: "var(--orange)" }}>github.com/your-org/santra-cli</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-3)" }}>discord</span>
                  <span style={{ color: "var(--text-3)" }}>→ </span>
                  <span style={{ color: "var(--orange)" }}>discord.gg/santra</span>
                </div>
              </div>

              <div style={{ color: "var(--text-2)" }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>Tips:</span> press{" "}
                <span style={{ color: "var(--orange)" }}>Enter</span> to send your current prompt.
              </div>
            </div>

            {/* input */}
            <div className="tui-input">
              <span style={{ color: "var(--orange)" }}>›</span>
              <span style={{ color: "var(--text-3)" }}>
                Ask the agent anything… (/ for commands)
              </span>
              <span
                style={{
                  display: "inline-block",
                  width: 1,
                  height: "1em",
                  background: "var(--text-2)",
                }}
              />
            </div>

            {/* status bar */}
            <div className="tui-status">
              <span style={{ color: "var(--orange)" }}>◆</span>
              <span>qwen2.5-coder-32b</span>
              <span>·</span>
              <span>0 tok</span>
              <span>·</span>
              <span>0 tools</span>
              <span>·</span>
              <span>0/20 steps</span>
              <span>·</span>
              <span>0s</span>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container-sm">
          <p className="overline" style={{ marginBottom: "1rem" }}>How it works</p>
          <h2 className="title" style={{ marginBottom: "1rem" }}>
            One prompt. Many specialists.
          </h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 520, marginBottom: "3rem" }}>
            Santra's orchestrator agent reads your request, explores the
            codebase, and delegates to focused sub-agents when the task
            requires it. Each specialist has a bounded role.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "0",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {AGENTS.map((a, i) => (
              <div
                key={a.name}
                style={{
                  padding: "1.25rem",
                  borderRight: i < AGENTS.length - 1 ? "1px solid var(--border)" : "none",
                  borderBottom: "none",
                }}
                className={`agent-cell-${i}`}
              >
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.72rem",
                    color: "var(--orange)",
                    marginBottom: "0.4rem",
                    fontWeight: 600,
                  }}
                >
                  {a.name}
                </div>
                <div style={{ color: "var(--text-2)", fontSize: "0.83rem", lineHeight: 1.55 }}>
                  {a.desc}
                </div>
              </div>
            ))}
          </div>
          <style>{`
            @media (max-width: 640px) {
              .agent-cell-0, .agent-cell-1, .agent-cell-2, .agent-cell-3 {
                border-right: none !important;
                border-bottom: 1px solid var(--border) !important;
              }
            }
          `}</style>
        </div>
      </section>

      <hr className="divider" />

      {/* ── Key features ──────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container-sm">
          <p className="overline" style={{ marginBottom: "1rem" }}>Features</p>
          <h2 className="title" style={{ marginBottom: "3rem" }}>
            Built for the terminal.
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  gap: "1rem",
                  padding: "1.5rem 0",
                  borderBottom: i < FEATURES.length - 1 ? "1px solid var(--border)" : "none",
                }}
                className="feature-row"
              >
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.8rem",
                    color: "var(--text-3)",
                    paddingTop: "0.15rem",
                  }}
                >
                  {f.tag}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.3rem" }}>
                    {f.title}
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.65 }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <style>{`
            @media (max-width: 520px) {
              .feature-row { grid-template-columns: 1fr !important; gap: 0.25rem !important; }
            }
          `}</style>
        </div>
      </section>

      <hr className="divider" />

      {/* ── BYOK / models ─────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container-sm">
          <p className="overline" style={{ marginBottom: "1rem" }}>Provider-agnostic</p>
          <h2 className="title" style={{ marginBottom: "1rem" }}>
            Your key. Any model.
          </h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 460, marginBottom: "2.5rem" }}>
            Set one environment variable. Santra routes directly to your
            provider — no middleman, no markup. Pay your provider, not a
            subscription.
          </p>

          <div className="code-block" style={{ marginBottom: "1.5rem" }}>
            <div className="c-gray"># Anthropic</div>
            <div>
              <span className="c-muted">export </span>
              <span className="c-blue">ANTHROPIC_API_KEY</span>
              <span className="c-muted">=sk-ant-...</span>
            </div>
            <br />
            <div className="c-gray"># Nvidia NIM (OpenAI-compatible)</div>
            <div>
              <span className="c-muted">export </span>
              <span className="c-blue">OPENAI_BASE_URL</span>
              <span className="c-muted">=https://integrate.api.nvidia.com/v1</span>
            </div>
            <div>
              <span className="c-muted">export </span>
              <span className="c-blue">OPENAI_API_KEY</span>
              <span className="c-muted">=nvapi-...</span>
            </div>
            <br />
            <div className="c-gray"># Ollama (local — no API key needed)</div>
            <div>
              <span className="c-muted">export </span>
              <span className="c-blue">OPENAI_BASE_URL</span>
              <span className="c-muted">=http://localhost:11434/v1</span>
            </div>
            <div>
              <span className="c-muted">export </span>
              <span className="c-blue">OPENAI_API_KEY</span>
              <span className="c-muted">=ollama</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem",
              marginBottom: "2rem",
            }}
          >
            {PROVIDERS.map((p) => (
              <span
                key={p}
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.6rem",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text-2)",
                }}
              >
                {p}
              </span>
            ))}
          </div>

          <Link href={LINKS.providers} style={{ color: "var(--orange)", fontSize: "0.875rem", textDecoration: "none" }}>
            Full provider guide →
          </Link>
        </div>
      </section>

      <hr className="divider" />

      {/* ── 23 tools ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "5rem 1.5rem" }}>
        <div className="container-sm">
          <p className="overline" style={{ marginBottom: "1rem" }}>Tooling</p>
          <h2 className="title" style={{ marginBottom: "1rem" }}>
            23 built-in tools.
          </h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 460, marginBottom: "2.5rem" }}>
            Agents have access to a full toolkit — file reads, targeted edits,
            shell execution, web search, and structured inter-agent messaging.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {TOOL_GROUPS.map((g, i) => (
              <div
                key={g.group}
                style={{
                  padding: "1.25rem",
                  borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                  borderBottom: i < TOOL_GROUPS.length - 2 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "var(--text-3)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "0.6rem",
                  }}
                >
                  {g.group}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  {g.tools.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "0.75rem",
                        color: "var(--text-2)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── Install CTA ───────────────────────────────────────────────────── */}
      <section style={{ padding: "6rem 1.5rem" }}>
        <div className="container-sm">
          <h2 className="title" style={{ marginBottom: "1rem" }}>
            Get started.
          </h2>
          <p style={{ color: "var(--text-2)", lineHeight: 1.7, maxWidth: 420, marginBottom: "2rem" }}>
            Install globally, set your key, and run in any repository.
            No account required.
          </p>

          <div className="code-block" style={{ marginBottom: "1.5rem" }}>
            <div>
              <span className="c-green">$ </span>
              <span className="c-text">npm install -g santra-cli</span>
            </div>
            <div>
              <span className="c-green">$ </span>
              <span className="c-text">export ANTHROPIC_API_KEY=sk-ant-...</span>
            </div>
            <div>
              <span className="c-green">$ </span>
              <span className="c-text">cd my-project && santra</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <Link href={LINKS.install} className="btn btn-fill">
              Full install guide →
            </Link>
            <Link href={LINKS.docs} className="btn btn-outline">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

const AGENTS = [
  { name: "orchestrator", desc: "Reads your request, explores the repo, delegates or acts directly." },
  { name: "file-picker",  desc: "Locates relevant files using glob and ripgrep search." },
  { name: "reader",       desc: "Synthesises architecture and implementation context." },
  { name: "executor",     desc: "Makes precise edits — str_replace or full file writes." },
  { name: "reviewer",     desc: "Critiques diffs and flags risks before applying." },
  { name: "thinker",      desc: "Reasons through hard decisions without using tools." },
];

const FEATURES = [
  {
    tag: "file-awareness",
    title: "Reads your whole repo",
    desc: "The agent indexes your directory tree, reads relevant files, and understands your architecture before touching anything. Files larger than 40 KB are truncated automatically.",
  },
  {
    tag: "change-approval",
    title: "Approves diffs before applying",
    desc: "Every file change surfaces a diff — line counts, changed content — and waits for your approval. You can accept, reject, or give feedback inline.",
  },
  {
    tag: "shell-execution",
    title: "Runs terminal commands",
    desc: "Agents can run shell commands with configurable timeouts. Tests, linters, build steps — anything you'd run yourself.",
  },
  {
    tag: "session-memory",
    title: "Persistent sessions",
    desc: "Conversations are auto-saved. Use /resume to reopen any past session. /copy exports the transcript to clipboard.",
  },
  {
    tag: "interactive",
    title: "Agents ask you questions",
    desc: "When the agent needs clarification, it pauses and presents a question — with optional choices. Your answer feeds back into the run.",
  },
  {
    tag: "open-source",
    title: "Extend with custom agents",
    desc: "Drop agent files into .agents/ to register custom specialists. Each agent defines its own system prompt, tools, and delegation rules.",
  },
];

const PROVIDERS = [
  "Anthropic", "OpenAI", "Nvidia NIM",
  "Groq", "Together AI", "Fireworks",
  "Ollama", "LM Studio", "vLLM",
  "any OpenAI-compatible API",
];

const TOOL_GROUPS = [
  {
    group: "File ops",
    tools: ["read_file", "write_file", "str_replace", "apply_patch"],
  },
  {
    group: "Search",
    tools: ["search_files", "search_text", "code_search", "glob", "read_subtree"],
  },
  {
    group: "Agent control",
    tools: ["spawn_agent", "spawn_agents", "task_completed", "set_output"],
  },
  {
    group: "Interactive",
    tools: ["ask_user", "web_search", "read_docs", "run_terminal_command"],
  },
];

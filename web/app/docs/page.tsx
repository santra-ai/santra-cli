import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "../lib/content";

export const metadata: Metadata = {
  title: "Docs",
  description: "Santra documentation — installation, agent system, tools, commands, and configuration.",
};

const SECTIONS = [
  { id: "overview",     label: "Overview" },
  { id: "install",      label: "Installation" },
  { id: "quickstart",   label: "Quickstart" },
  { id: "agents",       label: "Agent system" },
  { id: "tools",        label: "Tools reference" },
  { id: "commands",     label: "Commands" },
  { id: "providers",    label: "Providers" },
  { id: "config",       label: "Configuration" },
  { id: "custom-agents",label: "Custom agents" },
];

export default function DocsPage() {
  return (
    <div className="docs-layout">
      {/* Sidebar */}
      <aside className="docs-sidebar">
        <div style={{ padding: "0 1rem" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
            On this page
          </div>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: "block",
                fontSize: "0.83rem",
                color: "var(--text-2)",
                textDecoration: "none",
                padding: "0.3rem 0.5rem",
                borderRadius: 4,
                marginBottom: "0.1rem",
              }}
            >
              {s.label}
            </a>
          ))}
        </div>
      </aside>

      {/* Content */}
      <article className="docs-content">

        {/* Overview */}
        <section id="overview">
          <h1 style={{ fontWeight: 700, fontSize: "1.6rem", letterSpacing: "-0.03em", marginBottom: "0.75rem" }}>
            Santra Documentation
          </h1>
          <p>
            Santra is a repository-aware coding assistant that runs in your
            terminal. It reads your codebase, reasons about it, and makes
            precise edits using a swarm of specialised sub-agents — all
            routed through whichever model you choose.
          </p>
          <p>
            Key properties:
          </p>
          <ul>
            <li><strong>Provider-agnostic.</strong> Works with any OpenAI-compatible API, Anthropic, or Nvidia NIM.</li>
            <li><strong>Bring your own key.</strong> Requests go directly from your machine to your provider.</li>
            <li><strong>Multi-agent.</strong> An orchestrator spawns specialised sub-agents for file search, reading, implementation, review, and reasoning.</li>
            <li><strong>Terminal-native.</strong> Built with Ink (React for terminal). No electron, no browser.</li>
            <li><strong>MIT licensed.</strong> Fork, extend, and embed freely.</li>
          </ul>
        </section>

        {/* Installation */}
        <section id="install">
          <h2>Installation</h2>
          <p>Install globally via npm, pnpm, or yarn. Requires Node.js 18+.</p>
          <div className="code-block">
            <div><span className="c-green">$ </span><span className="c-text">npm install -g santra-cli</span></div>
            <div><span className="c-green">$ </span><span className="c-text">santra --version</span></div>
            <div><span className="c-muted">santra v1.0.0</span></div>
          </div>
          <p>
            See the <Link href={LINKS.install} style={{ color: "var(--orange)" }}>install guide</Link> for
            provider-specific setup and alternative package managers.
          </p>
        </section>

        {/* Quickstart */}
        <section id="quickstart">
          <h2>Quickstart</h2>
          <h3>1. Set your API key</h3>
          <div className="code-block">
            <div className="c-gray"># Anthropic (recommended)</div>
            <div><span className="c-green">$ </span><span className="c-text">export ANTHROPIC_API_KEY=sk-ant-...</span></div>
            <br />
            <div className="c-gray"># Or Ollama (local, no key needed)</div>
            <div><span className="c-green">$ </span><span className="c-text">export OPENAI_BASE_URL=http://localhost:11434/v1</span></div>
            <div><span className="c-green">$ </span><span className="c-text">export OPENAI_API_KEY=ollama</span></div>
          </div>

          <h3>2. Run in your project</h3>
          <div className="code-block">
            <div><span className="c-green">$ </span><span className="c-text">cd my-project</span></div>
            <div><span className="c-green">$ </span><span className="c-text">santra</span></div>
            <br />
            <div><span className="c-orange">● santra</span><span className="c-muted"> / my-project</span></div>
            <div><span className="c-muted">  ready for input…</span></div>
          </div>

          <h3>3. Type a task</h3>
          <div className="code-block">
            <div><span className="c-orange">›</span><span className="c-text"> Add input validation to the /api/users POST route</span></div>
            <br />
            <div><span className="c-muted">  [thinking] Reading route file…</span></div>
            <div><span className="c-muted">  [file-picker] found src/api/users.ts</span></div>
            <div><span className="c-muted">  [executor] str_replace → validation middleware added</span></div>
            <div><span className="c-muted">  [reviewer] diff approved</span></div>
          </div>

          <p>
            The agent will ask for your approval before applying any file
            changes. You&apos;ll see a diff with line counts and can accept, reject,
            or provide feedback.
          </p>
        </section>

        {/* Agent system */}
        <section id="agents">
          <h2>Agent system</h2>
          <p>
            Santra uses a dynamic multi-agent architecture. An orchestrator
            agent handles your request directly or delegates subtasks to
            specialist sub-agents via <code>spawn_agent</code> or{" "}
            <code>spawn_agents</code> (parallel).
          </p>

          <h3>Built-in agents</h3>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Role</th>
                <th>Tools</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_TABLE.map((a) => (
                <tr key={a.name}>
                  <td><code>{a.name}</code></td>
                  <td>{a.role}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: "0.75rem" }}>{a.tools}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Execution flow</h3>
          <p>
            The <strong>orchestrator</strong> is always the entry point. It
            reads your prompt, classifies the task, explores the repository,
            and either acts directly or delegates to specialists. Specialists
            return their output to the orchestrator, which synthesises the
            result.
          </p>
          <p>
            Agents share conversation context between runs. The orchestrator
            can spawn multiple agents in parallel using{" "}
            <code>spawn_agents</code> for independent subtasks (e.g.
            simultaneously reading two different files).
          </p>

          <h3>Change approval</h3>
          <p>
            Every file write surfaces a diff overlay in the TUI. You can:
          </p>
          <ul>
            <li><strong>Accept all</strong> — apply changes immediately</li>
            <li><strong>Reject</strong> — discard the change</li>
            <li><strong>Feedback</strong> — type a correction; the agent revises</li>
          </ul>
        </section>

        {/* Tools reference */}
        <section id="tools">
          <h2>Tools reference</h2>
          <p>
            Agents have access to 23 built-in tools. Each tool is defined in{" "}
            <code>packages/shared/</code> and executed locally by the
            agent runtime.
          </p>

          {TOOL_GROUPS.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {g.tools.map((t) => (
                    <tr key={t.name}>
                      <td><code>{t.name}</code></td>
                      <td>{t.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <p>
            Files larger than 40 KB are automatically truncated. Standard
            directories like <code>node_modules</code>, <code>.git</code>,{" "}
            <code>dist</code>, and <code>.next</code> are excluded from all
            search and listing operations.
          </p>
        </section>

        {/* Commands */}
        <section id="commands">
          <h2>Commands</h2>
          <p>
            Type <code>/</code> in the input to see available commands. The
            TUI shows a suggestion overlay as you type.
          </p>
          <table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((cmd) => (
                <tr key={cmd.name}>
                  <td><code>{cmd.name}</code></td>
                  <td>{cmd.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Keyboard shortcuts</h3>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {KEYS.map((k) => (
                <tr key={k.key}>
                  <td><code>{k.key}</code></td>
                  <td>{k.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Providers */}
        <section id="providers">
          <h2>Providers</h2>
          <p>
            Santra uses environment variables for provider configuration.
            Any server implementing the OpenAI chat-completions API is
            compatible.
          </p>

          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Environment variables</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDER_TABLE.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: "0.75rem" }}>{p.vars}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            See the <Link href={LINKS.providers} style={{ color: "var(--orange)" }}>providers page</Link> for
            complete setup instructions including Nvidia NIM and local inference.
          </p>
        </section>

        {/* Config */}
        <section id="config">
          <h2>Configuration</h2>
          <h3>Environment variables</h3>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((v) => (
                <tr key={v.name}>
                  <td><code>{v.name}</code></td>
                  <td>{v.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Session files</h3>
          <p>
            Sessions are auto-saved to <code>.santra-logs/</code> in your
            project directory. Each session file uses an ISO timestamp as its
            ID. Use <code>/resume</code> to browse and reopen saved sessions.
          </p>
        </section>

        {/* Custom agents */}
        <section id="custom-agents">
          <h2>Custom agents</h2>
          <p>
            Drop agent definition files into a <code>.agents/</code> directory
            in your project root. Santra loads them automatically on startup.
          </p>
          <p>
            Each agent file exports an object with the following shape:
          </p>
          <div className="code-block">
{`export const myAgent = {
  id: "my-agent",
  name: "My Agent",
  description: "What this agent does.",
  systemPrompt: \`Your custom system prompt here.\`,
  toolNames: ["read_file", "str_replace", "task_completed"],
  canBeSpawned: true,
};`}
          </div>

          <h3>Fields</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_FIELDS.map((f) => (
                <tr key={f.field}>
                  <td><code>{f.field}</code></td>
                  <td>{f.req}</td>
                  <td>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            The <code>toolNames</code> array controls which tools the agent
            has access to. Use the smallest set that fits the agent&apos;s role —
            this reduces context and keeps the agent focused.
          </p>
        </section>

      </article>
    </div>
  );
}

const AGENT_TABLE = [
  { name: "orchestrator", role: "Entry point. Reads request, explores repo, delegates or acts directly.", tools: "all tools" },
  { name: "file-picker",  role: "Locates relevant files using glob and ripgrep.", tools: "search_files, code_search, glob, list_directory" },
  { name: "reader",       role: "Synthesises architecture and implementation context from files.", tools: "read_file, read_subtree, list_directory" },
  { name: "executor",     role: "Makes precise edits — str_replace for surgical changes, write_file for new files.", tools: "read_file, write_file, str_replace, apply_patch" },
  { name: "reviewer",     role: "Critiques diffs and flags risks. Does not make edits.", tools: "read_file" },
  { name: "thinker",      role: "Reasons through complex decisions. No file tools — pure reasoning.", tools: "task_completed" },
];

const TOOL_GROUPS = [
  {
    group: "File operations",
    tools: [
      { name: "read_file",       desc: "Read full text content of a file. Truncates at 40 KB." },
      { name: "write_file",      desc: "Create a new file or fully overwrite an existing one." },
      { name: "str_replace",     desc: "Surgical edit — replace an exact string in a file." },
      { name: "apply_patch",     desc: "Apply a unified diff patch across one or more files." },
    ],
  },
  {
    group: "Search & navigation",
    tools: [
      { name: "list_directory",  desc: "List immediate children of a directory with type metadata." },
      { name: "search_files",    desc: "Find files matching a glob pattern." },
      { name: "search_text",     desc: "Ripgrep-based content search with regex support." },
      { name: "code_search",     desc: "Semantic code search (ripgrep with type hints)." },
      { name: "glob",            desc: "Fast pattern-based file matching." },
      { name: "read_subtree",    desc: "Recursive directory snapshot with content limits (12 KB default)." },
      { name: "get_cwd",         desc: "Return the current working directory." },
    ],
  },
  {
    group: "Agent control",
    tools: [
      { name: "spawn_agent",     desc: "Delegate a bounded subtask to a single specialist agent." },
      { name: "spawn_agents",    desc: "Run multiple specialist agents in parallel." },
      { name: "lookup_agent_info",desc: "Inspect registered agent metadata." },
      { name: "task_completed",  desc: "Signal task completion with an optional summary." },
      { name: "set_output",      desc: "Set structured output for programmatic consumers." },
      { name: "set_messages",    desc: "Replace or append conversation messages." },
      { name: "suggest_followups",desc: "Return suggested follow-up actions to the user." },
    ],
  },
  {
    group: "Interactive & external",
    tools: [
      { name: "ask_user",        desc: "Pause the run and request clarification. Supports multi-choice questions." },
      { name: "web_search",      desc: "Search the public web for current information." },
      { name: "read_docs",       desc: "Read documentation from a URL or local path." },
      { name: "run_terminal_command", desc: "Execute a shell command with configurable timeout." },
      { name: "write_todos",     desc: "Lightweight planning memory scoped to the current run." },
    ],
  },
];

const COMMANDS = [
  { name: "/resume",  desc: "Browse and reopen a saved session. Supports fuzzy filtering." },
  { name: "/clear",   desc: "Wipe the current transcript and cumulative history." },
  { name: "/copy",    desc: "Copy the visible transcript to clipboard (pbcopy / xclip / wl-copy)." },
  { name: "/model",   desc: "Show the active model name." },
];

const KEYS = [
  { key: "Enter",       action: "Send the current prompt." },
  { key: "Esc",         action: "Stop the running agent, or clear input." },
  { key: "F2",          action: "Toggle between scroll mode and select mode (for text selection)." },
  { key: "↑ / ↓",       action: "In scroll mode: scroll transcript. In input: navigate suggestions." },
  { key: "j / k",       action: "Scroll transcript (vim-style, scroll mode only)." },
  { key: "PgUp / PgDn", action: "Scroll by page." },
  { key: "Home / End",  action: "Jump to top or bottom of transcript." },
  { key: "Tab",         action: "Accept the top suggestion in the suggestion overlay." },
  { key: "Ctrl+C",      action: "Exit Santra." },
];

const PROVIDER_TABLE = [
  { name: "Anthropic",    vars: "ANTHROPIC_API_KEY" },
  { name: "OpenAI",       vars: "OPENAI_API_KEY" },
  { name: "Nvidia NIM",   vars: "OPENAI_BASE_URL, OPENAI_API_KEY" },
  { name: "Groq",         vars: "OPENAI_BASE_URL, OPENAI_API_KEY" },
  { name: "Ollama",       vars: "OPENAI_BASE_URL=http://localhost:11434/v1, OPENAI_API_KEY=ollama" },
  { name: "Any compat.",  vars: "OPENAI_BASE_URL, OPENAI_API_KEY" },
];

const ENV_VARS = [
  { name: "ANTHROPIC_API_KEY",  desc: "Anthropic API key for Claude models." },
  { name: "OPENAI_API_KEY",     desc: "Key for OpenAI or any OpenAI-compatible provider." },
  { name: "OPENAI_BASE_URL",    desc: "Override the OpenAI base URL to point at any compatible server." },
  { name: "SANTRA_MODEL",       desc: "Pin a specific model ID (overrides the agent default)." },
];

const AGENT_FIELDS = [
  { field: "id",           req: "yes", desc: "Unique identifier for this agent. Used by spawn_agent." },
  { field: "name",         req: "yes", desc: "Human-readable display name." },
  { field: "description",  req: "yes", desc: "Short description of the agent's role." },
  { field: "systemPrompt", req: "yes", desc: "The full system prompt string." },
  { field: "toolNames",    req: "yes", desc: "Array of tool names this agent has access to." },
  { field: "canBeSpawned", req: "no",  desc: "If true, the orchestrator can delegate to this agent. Default: false." },
];

import type { ToolCallRequest, ToolCallResult } from "@santra/shared";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

// Files larger than this are truncated to prevent context overflow.
const MAX_READ_BYTES = 40_000; // ~40KB — enough for any real source file

// ─── Handlers
// Read a file from disk and return its content plus a small metadata summary.
async function handleReadFile(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  if (!path) throw new Error("read_file: 'path' is required");
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) throw new Error(`read_file: not found: ${path}`);
  const info = await stat(abs);
  if (info.isDirectory()) {
    throw new Error(`read_file: '${path}' is a directory — use list_directory to list its contents.`);
  }
  const raw = await readFile(abs, "utf-8");
  const truncated = raw.length > MAX_READ_BYTES;
  const content = truncated ? raw.slice(0, MAX_READ_BYTES) : raw;
  return JSON.stringify({
    path,
    absolutePath: abs,
    content: truncated
      ? content + `\n\n[...file truncated — ${raw.length} bytes total, showing first ${MAX_READ_BYTES}]`
      : content,
    lines: raw.split("\n").length,
    truncated,
  });
}

// Replace an exact string in a file — surgical edit, much safer than rewriting the whole file.
async function handleStrReplace(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  const oldString = p["old_string"] as string;
  const newString = p["new_string"] as string;
  if (!path) throw new Error("str_replace: 'path' is required");
  if (oldString === undefined || oldString === null)
    throw new Error("str_replace: 'old_string' is required");
  if (newString === undefined || newString === null)
    throw new Error("str_replace: 'new_string' is required");
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) throw new Error(`str_replace: file not found: ${path}`);
  const content = await readFile(abs, "utf-8");
  if (!content.includes(oldString))
    throw new Error(
      `str_replace: old_string not found in ${path}. Make sure it matches exactly (including whitespace).`,
    );
  const updated = content.replace(oldString, newString);
  await writeFile(abs, updated, "utf-8");
  return JSON.stringify({
    path,
    absolutePath: abs,
    message: `str_replace applied to ${path}`,
    linesChanged: oldString.split("\n").length,
  });
}

// Write content to a file, creating parent folders when needed.
async function handleWriteFile(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  const content = p["content"] as string;
  if (!path) throw new Error("write_file: 'path' is required");
  if (content === undefined)
    throw new Error("write_file: 'content' is required");
  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf-8");
  return JSON.stringify({
    path,
    absolutePath: abs,
    message: `Wrote ${content.length} chars to ${path}`,
  });
}

async function handleApplyPatch(p: Record<string, unknown>): Promise<string> {
  const patch = p["patch"] as string | undefined;
  if (!patch?.trim()) throw new Error("apply_patch: 'patch' is required");

  const patchPath = resolve(
    tmpdir(),
    `santra-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`,
  );
  await writeFile(patchPath, patch, "utf-8");

  const proc = Bun.spawnSync({
    cmd: ["git", "apply", "--whitespace=nowarn", patchPath],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(stderr || "apply_patch failed");
  }

  return JSON.stringify({
    message: "Patch applied successfully",
  });
}

// Directories and files to hide from listing — they're noise for the agent.
const IGNORED_NAMES = new Set([
  "node_modules", ".git", ".santra-logs", ".next", "dist", "build",
  "out", ".cache", "coverage", "__pycache__", ".DS_Store", "bun.lock",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "codebuff.txt", // large reference file, not part of the project source
]);

// List direct children of a directory with simple file/directory metadata.
async function handleListDirectory(
  p: Record<string, unknown>,
): Promise<string> {
  const path = (p["path"] as string) ?? ".";
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) throw new Error(`list_directory: not found: ${path}`);
  const entries = await readdir(abs, { withFileTypes: true });
  const result = entries
    .filter((e) => !IGNORED_NAMES.has(e.name) && !e.name.startsWith("."))
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
      path: join(path, e.name),
    }));
  return JSON.stringify({ path, absolutePath: abs, entries: result });
}

// Find files matching a glob pattern under a given working directory.
async function handleSearchFiles(p: Record<string, unknown>): Promise<string> {
  const pattern = p["pattern"] as string;
  const cwd = (p["cwd"] as string) ?? ".";
  if (!pattern) throw new Error("search_files: 'pattern' is required");
  const absCwd = resolve(process.cwd(), cwd);
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: absCwd, onlyFiles: true })) {
    files.push(f);
  }
  return JSON.stringify({
    pattern,
    cwd,
    absoluteCwd: absCwd,
    files,
    count: files.length,
  });
}

async function handleGlob(p: Record<string, unknown>): Promise<string> {
  return handleSearchFiles(p);
}

// Search file contents using ripgrep so agents can find symbols and behavior quickly.
async function handleSearchText(p: Record<string, unknown>): Promise<string> {
  const query = p["query"] as string;
  const cwd = (p["cwd"] as string) ?? ".";
  const glob = p["glob"] as string | undefined;

  if (!query) throw new Error("search_text: 'query' is required");

  const absCwd = resolve(process.cwd(), cwd);
  const cmd = ["rg", "-n", "--no-heading", "--color", "never"];

  if (glob) {
    cmd.push("--glob", glob);
  }

  cmd.push(query, absCwd);

  const proc = Bun.spawnSync({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0 && proc.exitCode !== 1) {
    const stderr = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(stderr || "search_text failed");
  }

  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const matches = stdout
    ? stdout
        .split("\n")
        .slice(0, 200)
        .map((line) => {
          const [file = "", lineNumber = "", ...rest] = line.split(":");
          return {
            file,
            line: Number(lineNumber) || 0,
            text: rest.join(":"),
          };
        })
    : [];

  return JSON.stringify({
    query,
    cwd,
    glob: glob ?? null,
    count: matches.length,
    matches,
  });
}

async function handleCodeSearch(p: Record<string, unknown>): Promise<string> {
  return handleSearchText(p);
}

async function handleReadSubtree(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  const maxChars = Number(p["max_chars"] ?? 12_000);
  if (!path) throw new Error("read_subtree: 'path' is required");

  const absRoot = resolve(process.cwd(), path);
  if (!existsSync(absRoot)) throw new Error(`read_subtree: not found: ${path}`);
  const info = await stat(absRoot);
  if (!info.isDirectory()) {
    throw new Error(`read_subtree: '${path}' is not a directory`);
  }

  const sections: string[] = [];
  let total = 0;

  const walk = async (relPath: string) => {
    if (total >= maxChars) return;
    const abs = resolve(process.cwd(), relPath);
    const entries = await readdir(abs, { withFileTypes: true });

    for (const entry of entries) {
      if (total >= maxChars) break;
      if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;

      const childRel = join(relPath, entry.name);
      if (entry.isDirectory()) {
        sections.push(`## ${childRel}/`);
        total += childRel.length + 4;
        await walk(childRel);
        continue;
      }

      const raw = await readFile(resolve(process.cwd(), childRel), "utf-8");
      const remaining = Math.max(0, maxChars - total);
      const snippet = raw.slice(0, remaining);
      sections.push(`--- ${childRel} ---\n${snippet}`);
      total += childRel.length + snippet.length + 10;
    }
  };

  await walk(path);

  return JSON.stringify({
    path,
    absolutePath: absRoot,
    maxChars,
    truncated: total >= maxChars,
    content: sections.join("\n\n"),
  });
}

async function handleWriteTodos(p: Record<string, unknown>): Promise<string> {
  const rawTodos = p["todos"];
  const todos =
    typeof rawTodos === "string"
      ? JSON.parse(rawTodos) as unknown
      : rawTodos;

  if (!Array.isArray(todos)) {
    throw new Error("write_todos: 'todos' must be an array or JSON array string");
  }

  return JSON.stringify({
    message: "Todo list recorded for this turn",
    todos,
    count: todos.length,
  });
}

async function handleRunTerminalCommand(
  p: Record<string, unknown>,
): Promise<string> {
  const command = p["command"] as string | undefined;
  const cwd = (p["cwd"] as string | undefined) ?? process.cwd();
  const timeout = Number(p["timeout_ms"] ?? 30_000);
  if (!command?.trim()) {
    throw new Error("run_terminal_command: 'command' is required");
  }

  const proc = Bun.spawnSync({
    cmd: ["zsh", "-lc", command],
    cwd: resolve(process.cwd(), cwd),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
    timeout,
  });

  return JSON.stringify({
    command,
    cwd,
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
  });
}

async function handleSuggestFollowups(
  p: Record<string, unknown>,
): Promise<string> {
  const raw = p["suggestions"];
  const suggestions =
    typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!Array.isArray(suggestions)) {
    throw new Error(
      "suggest_followups: 'suggestions' must be an array or JSON array string",
    );
  }
  return JSON.stringify({
    suggestions,
    count: suggestions.length,
  });
}

async function handleAskUser(p: Record<string, unknown>): Promise<string> {
  const question = p["question"] as string | undefined;
  if (!question?.trim()) throw new Error("ask_user: 'question' is required");
  return JSON.stringify({
    paused: true,
    supported: false,
    question,
    message:
      "ask_user is not yet interactive in this CLI session, so the question was recorded but not sent to the user as a form.",
  });
}

async function handleWebSearch(p: Record<string, unknown>): Promise<string> {
  const query = p["query"] as string | undefined;
  if (!query?.trim()) throw new Error("web_search: 'query' is required");

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Santra/1.0",
    },
  });
  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
    .slice(0, 5)
    .map((match) => ({
      url: match[1],
      title: (match[2] ?? "").replace(/<[^>]+>/g, "").trim(),
    }));

  return JSON.stringify({
    query,
    results: matches,
    count: matches.length,
  });
}

async function handleReadDocs(p: Record<string, unknown>): Promise<string> {
  const source = p["source"] as string | undefined;
  if (!source?.trim()) throw new Error("read_docs: 'source' is required");

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    const text = await response.text();
    return JSON.stringify({
      source,
      content: text.slice(0, MAX_READ_BYTES),
      truncated: text.length > MAX_READ_BYTES,
    });
  }

  return handleReadFile({ path: source });
}

async function handleGetCwd(): Promise<string> {
  return JSON.stringify({ cwd: process.cwd() });
}

// ─── Dispatcher

// Execute one tool call and always return a structured success/error result.
export async function executeToolCall(
  call: ToolCallRequest,
): Promise<ToolCallResult> {
  try {
    let output: string;
    switch (call.name) {
      case "read_file":
        output = await handleReadFile(call.parameters);
        break;
      case "write_file":
        output = await handleWriteFile(call.parameters);
        break;
      case "str_replace":
        output = await handleStrReplace(call.parameters);
        break;
      case "apply_patch":
        output = await handleApplyPatch(call.parameters);
        break;
      case "list_directory":
        output = await handleListDirectory(call.parameters);
        break;
      case "search_files":
        output = await handleSearchFiles(call.parameters);
        break;
      case "search_text":
        output = await handleSearchText(call.parameters);
        break;
      case "glob":
        output = await handleGlob(call.parameters);
        break;
      case "code_search":
        output = await handleCodeSearch(call.parameters);
        break;
      case "read_subtree":
        output = await handleReadSubtree(call.parameters);
        break;
      case "write_todos":
        output = await handleWriteTodos(call.parameters);
        break;
      case "run_terminal_command":
        output = await handleRunTerminalCommand(call.parameters);
        break;
      case "suggest_followups":
        output = await handleSuggestFollowups(call.parameters);
        break;
      case "ask_user":
        output = await handleAskUser(call.parameters);
        break;
      case "web_search":
        output = await handleWebSearch(call.parameters);
        break;
      case "read_docs":
        output = await handleReadDocs(call.parameters);
        break;
      case "set_output":
      case "set_messages":
      case "task_completed":
      case "lookup_agent_info":
        output = JSON.stringify({
          ok: true,
          note: `${call.name} is handled by the agent runtime`,
        });
        break;
      case "get_cwd":
        output = await handleGetCwd();
        break;
      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
    return { id: call.id, name: call.name, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      id: call.id,
      name: call.name,
      output: JSON.stringify({ error }),
      error,
    };
  }
}

import type { DiffEntry, LogEntry } from "../types.ts";
import type { RunEvent } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function cleanPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function truncateText(text: string, max = 72): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeSentence(text: string, max = 88): string {
  const cleaned = cleanAgentResponse(text);
  const normalized = normalizeWhitespace(cleaned);
  if (!normalized) return "";
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// Exported so useAgent.ts can apply the same cleaning to fallback output paths
export { cleanAgentResponse };

/**
 * Cleans agent response text before display:
 * 1. Strips bare JSON wrapper objects (orchestrator structured output)
 * 2. Strips <tool_call>...</tool_result> XML blocks the LLM leaks into responses
 * 3. Strips <think>...</think> reasoning blocks the model may leak
 * 4. Strips orphaned opening/closing tool or think tags
 * 5. Collapses excessive blank lines
 */
function cleanAgentResponse(text: string): string {
  let s = text.trim();
  if (!s) return "";

  // If it's pure JSON, try to extract a 'text' or 'content' field for better narration.
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>;
      for (const key of ["text", "content", "summary", "message", "response"]) {
        const val = parsed[key];
        if (typeof val === "string" && val.trim()) return cleanAgentResponse(val);
      }
      
      const tt = parsed["task_type"];
      if (tt === "read") return "Deciding to inspect the codebase...";
      if (tt === "write") return "Deciding to make changes...";
      if (tt === "direct") return "Deciding how to answer directly...";
    } catch { /* not valid JSON, fall through */ }
  }

  // Strip standalone JSON objects leaked into text.
  s = s.replace(/\{[\s\S]*?"(?:path|content|entries|lines|matches|id)"[\s\S]*?\}/g, "");

  // Strip complete XML blocks that leaked into visible output.
  s = s.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_(?:call|result)>/gi, "");
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, "");
  s = s.replace(/<next\b[^>]*>[\s\S]*?<\/next>/gi, "");

  // Strip orphaned tags
  s = s.replace(/<(?:tool_call|tool_result|think|status|next)\b[^>]*>/gi, "");
  s = s.replace(/<\/(?:tool_call|tool_result|think|status|next)>/gi, "");

  // Strip anything that looks like an unfinished block at the end
  s = s.replace(/<\/?(?:tool_call|think|status|next)\b[\s\S]*$/gi, "");
  s = s.replace(/<\/?[a-z]*$/gi, ""); // Strip any orphaned < or </ at the very end
  s = s.replace(/(?:<\/\s*>?[ \t]*)+/g, ""); // Strip random orphaned </ that Gemini leaks

  // Collapse 3+ consecutive blank lines → 2
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

function extractUserTask(task: string): string {
  const taskMatch = /Task:\s*([^\n]+)/i.exec(task);
  const extracted = taskMatch?.[1] ?? task;
  return summarizeSentence(extracted, 84);
}

function describeSectionStart(agentId: string, task: string): string {
  const userTask = extractUserTask(task).toLowerCase();
  const broadRepoRead =
    userTask.includes("codebase") ||
    userTask.includes("repo") ||
    userTask.includes("project");

  switch (agentId) {
    case "orchestrator":
      return broadRepoRead
        ? "Understanding the codebase"
        : "Planning the next step";
    case "file-picker":
      return broadRepoRead
        ? "Mapping the repository structure"
        : "Finding the relevant files";
    case "reader":
      return broadRepoRead
        ? "Reading key files across the repository"
        : "Reading the relevant files";
    case "executor":
      return userTask.includes("read ") || userTask.includes("explain")
        ? "Preparing the final explanation"
        : "Implementing the requested change";
    case "reviewer":
      return "Reviewing the recent work";
    case "thinker":
      return "Reasoning through the tricky parts";
    default:
      return "Working on the task";
  }
}

function summarizeAgentOutput(
  agentId: string,
  output: string,
): string | undefined {
  const cleaned = cleanAgentResponse(output);
  if (!cleaned) return undefined;

  // The main agent and file-picker often return short summaries that are useful
  // to surface in the section footer.
  if (agentId === "orchestrator" || agentId === "file-picker") {
    return cleaned.length > 500 ? `${cleaned.slice(0, 500)}...` : cleaned;
  }
  
  // The reader and executor final responses are streamed separately, so don't summarize them here
  // to avoid duplicating their entire text block inside the section checkmark.
  return undefined;
}


function describeModelTurnDone(turn: number, summary: string): string {
  return summary;
}

function buildReadPreview(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const content =
      typeof parsed["content"] === "string" ? parsed["content"] : "";
    if (!content) return undefined;

    const preview = content
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith("//") && !line.startsWith("/*"),
      )
      .slice(0, 3)
      .map((line) => truncateText(line, 96));

    return preview.length > 0 ? preview.join("\n") : undefined;
  } catch {
    return undefined;
  }
}

function describeToolCallActive(
  name: string,
  parameters: Record<string, unknown>,
): string {
  const path =
    typeof parameters["path"] === "string"
      ? cleanPath(parameters["path"])
      : undefined;
  const query =
    typeof parameters["query"] === "string" ? parameters["query"] : undefined;
  const pattern =
    typeof parameters["pattern"] === "string"
      ? parameters["pattern"]
      : undefined;

  switch (name) {
    case "read_file":
      return `Reading ${path ?? "file"}`;
    case "write_file":
      return `Writing ${path ?? "file"}`;
    case "str_replace":
      return `Editing ${path ?? "file"}`;
    case "apply_patch":
      return "Applying a patch";
    case "list_directory":
      return `Reading folder ${path ?? "."}`;
    case "search_files":
    case "glob":
      return pattern ? `Finding files matching ${pattern}` : "Finding files";
    case "search_text":
    case "code_search":
      return query
        ? `Searching code for "${truncateText(query, 48)}"`
        : "Searching code";
    case "read_subtree":
      return `Reading subtree ${path ?? "."}`;
    case "write_todos":
      return "Updating the task plan";
    case "run_terminal_command":
      return "Running a terminal command";
    case "spawn_agent":
      return `Spawning ${String(parameters["agent"] ?? "agent")}`;
    case "spawn_agents":
      return "Spawning parallel agents";
    case "set_output":
      return "Setting structured output";
    case "set_messages":
      return "Updating conversation state";
    case "task_completed":
      return "Marking the task complete";
    case "suggest_followups":
      return "Preparing follow-up suggestions";
    case "lookup_agent_info":
      return `Inspecting agent ${String(parameters["agent"] ?? "info")}`;
    case "ask_user":
      return "Preparing a clarification question";
    case "web_search":
      return query
        ? `Searching the web for "${truncateText(query, 48)}"`
        : "Searching the web";
    case "read_docs":
      return `Reading docs from ${String(parameters["source"] ?? "source")}`;
    case "get_cwd":
      return "Checking the working directory";
    default:
      return `Running ${name}`;
  }
}

function buildToolCallDetail(
  name: string,
  parameters: Record<string, unknown>,
  output: string,
): string | undefined {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;

    if (name === "list_directory") {
      const entries = parsed["entries"] as
        | Array<{ name: string; type: "file" | "directory" }>
        | undefined;
      if (!entries?.length) return undefined;
      const shown = entries
        .slice(0, 8)
        .map((e) => (e.type === "directory" ? `${e.name}/` : e.name));
      if (entries.length > shown.length)
        shown.push(`… ${entries.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "search_files") {
      const files = parsed["files"] as string[] | undefined;
      if (!files?.length) return undefined;
      const shown = files.slice(0, 6).map((f) => cleanPath(f));
      if (files.length > shown.length)
        shown.push(`… ${files.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "glob") {
      const files = parsed["files"] as string[] | undefined;
      if (!files?.length) return undefined;
      const shown = files.slice(0, 6).map((f) => cleanPath(f));
      if (files.length > shown.length)
        shown.push(`… ${files.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "search_text") {
      const matches = parsed["matches"] as
        | Array<{ file?: string; line?: number; text?: string }>
        | undefined;
      if (!matches?.length) return undefined;
      const shown = matches.slice(0, 5).map((m) => {
        const file = typeof m.file === "string" ? cleanPath(m.file) : "file";
        const line =
          typeof m.line === "number" && m.line > 0 ? `:${m.line}` : "";
        const snippet =
          typeof m.text === "string"
            ? truncateText(normalizeWhitespace(m.text))
            : "";
        return snippet ? `${file}${line}  ${snippet}` : `${file}${line}`;
      });
      if (matches.length > shown.length)
        shown.push(`… ${matches.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "code_search") {
      const matches = parsed["matches"] as
        | Array<{ file?: string; line?: number; text?: string }>
        | undefined;
      if (!matches?.length) return undefined;
      const shown = matches.slice(0, 5).map((m) => {
        const file = typeof m.file === "string" ? cleanPath(m.file) : "file";
        const line =
          typeof m.line === "number" && m.line > 0 ? `:${m.line}` : "";
        const snippet =
          typeof m.text === "string"
            ? truncateText(normalizeWhitespace(m.text))
            : "";
        return snippet ? `${file}${line}  ${snippet}` : `${file}${line}`;
      });
      if (matches.length > shown.length)
        shown.push(`… ${matches.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "get_cwd") {
      const cwd = typeof parsed["cwd"] === "string" ? parsed["cwd"] : undefined;
      return cwd ? cleanPath(cwd) : undefined;
    }

    if (name === "read_file") {
      const lines =
        typeof parsed["lines"] === "number" ? parsed["lines"] : undefined;
      const truncated = parsed["truncated"] === true ? "truncated" : undefined;
      const path =
        typeof parameters["path"] === "string"
          ? cleanPath(parameters["path"])
          : undefined;
      const preview = buildReadPreview(output);
      return (
        [
          path,
          lines !== undefined ? `${lines} lines` : undefined,
          truncated,
          preview,
        ]
          .filter(Boolean)
          .join("\n") || undefined
      );
    }

    if (name === "read_subtree") {
      const content =
        typeof parsed["content"] === "string" ? parsed["content"] : "";
      if (!content) return undefined;
      return truncateText(content.replace(/\s+/g, " "), 220);
    }

    if (name === "run_terminal_command") {
      const stdout =
        typeof parsed["stdout"] === "string" ? parsed["stdout"].trim() : "";
      const stderr =
        typeof parsed["stderr"] === "string" ? parsed["stderr"].trim() : "";
      const preview = stdout || stderr;
      return preview ? truncateText(preview.replace(/\s+/g, " "), 220) : undefined;
    }

    if (name === "spawn_agent") {
      const agent =
        typeof parsed["agent"] === "string" ? parsed["agent"] : undefined;
      const output =
        typeof parsed["output"] === "string" ? parsed["output"] : undefined;
      return [agent ? `Agent: ${agent}` : undefined, output]
        .filter(Boolean)
        .join("\n");
    }

    if (name === "spawn_agents") {
      const results = parsed as unknown as Array<Record<string, unknown>>;
      if (!Array.isArray(results) || results.length === 0) return undefined;
      return results
        .slice(0, 4)
        .map((item) => {
          const agent = typeof item["agent"] === "string" ? item["agent"] : "agent";
          const error = typeof item["error"] === "string" ? item["error"] : "";
          const output = typeof item["output"] === "string" ? item["output"] : "";
          return error ? `${agent}: ${truncateText(error, 80)}` : `${agent}: ${truncateText(output, 80)}`;
        })
        .join("\n");
    }

    if (name === "ask_user") {
      const question =
        typeof parsed["question"] === "string" ? parsed["question"] : undefined;
      return question;
    }

    if (name === "web_search") {
      const results = parsed["results"] as Array<{ title?: string; url?: string }> | undefined;
      if (!results?.length) return undefined;
      return results
        .slice(0, 4)
        .map((result) =>
          `${truncateText(result.title ?? "Result", 60)}${result.url ? ` — ${truncateText(result.url, 80)}` : ""}`,
        )
        .join("\n");
    }

    if (name === "read_docs") {
      const content =
        typeof parsed["content"] === "string" ? parsed["content"] : "";
      return content ? truncateText(content.replace(/\s+/g, " "), 220) : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function describeToolError(
  name: string,
  parameters: Record<string, unknown>,
  error: string,
): string {
  const path =
    typeof parameters["path"] === "string"
      ? cleanPath(parameters["path"])
      : undefined;

  if (error === `${name}: 'path' is required`) {
    if (name === "read_file") return "Couldn't read a file — no path provided.";
    if (name === "write_file")
      return "Couldn't write a file — no path provided.";
    if (name === "str_replace")
      return "Couldn't edit a file — no path provided.";
  }
  if (error === "write_file: 'content' is required")
    return "Couldn't write file — no content provided.";
  if (error === "str_replace: 'old_string' is required")
    return "Couldn't edit file — replacement source missing.";
  if (error === "str_replace: 'new_string' is required")
    return "Couldn't edit file — replacement target missing.";
  if (error === "search_files: 'pattern' is required")
    return "Couldn't search files — no pattern provided.";
  if (error === "search_text: 'query' is required")
    return "Couldn't search code — no query provided.";
  if (error === "read_subtree: 'path' is required")
    return "Couldn't read the subtree — no path provided.";
  if (error === "run_terminal_command: 'command' is required")
    return "Couldn't run the command — no command was provided.";
  if (
    error === "ask_user: 'question' is required" ||
    error === "ask_user: 'questions' is required"
  )
    return "Couldn't prepare questions — no question was provided.";
  if (error === "ask_user: 'questions' must be valid JSON")
    return "Couldn't prepare questions — the question payload was invalid.";
  if (error === "web_search: 'query' is required")
    return "Couldn't search the web — no query was provided.";
  if (error === "read_docs: 'source' is required")
    return "Couldn't read docs — no source was provided.";

  const missingFile = /^read_file: not found: (.+)$/.exec(error);
  if (missingFile)
    return `Not found: ${cleanPath(missingFile[1] ?? path ?? "that file")}`;

  const missingDir = /^list_directory: not found: (.+)$/.exec(error);
  if (missingDir)
    return `Directory not found: ${cleanPath(missingDir[1] ?? path ?? ".")}`;

  const missingEditFile = /^str_replace: file not found: (.+)$/.exec(error);
  if (missingEditFile)
    return `Not found: ${cleanPath(missingEditFile[1] ?? path ?? "that file")}`;

  const directoryMatch = /^read_file: '(.+)' is a directory/.exec(error);
  if (directoryMatch)
    return `${cleanPath(directoryMatch[1] ?? path ?? "That path")} is a directory.`;

  const oldStringMatch = /^str_replace: old_string not found in (.+)\./.exec(
    error,
  );
  if (oldStringMatch)
    return `Text to replace not found in ${cleanPath(oldStringMatch[1] ?? path ?? "that file")}.`;

  const prefix = `${name}: `;
  const cleaned = error.startsWith(prefix) ? error.slice(prefix.length) : error;
  const normalized = cleaned.trim();
  if (!normalized) return "Tool call failed.";
  const sentence = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function describeToolCallDone(
  name: string,
  parameters: Record<string, unknown>,
  output: string,
  error?: string,
): string {
  if (error) return `${describeToolCallActive(name, parameters)} — failed`;

  const path =
    typeof parameters["path"] === "string"
      ? cleanPath(parameters["path"])
      : undefined;
  const query =
    typeof parameters["query"] === "string" ? parameters["query"] : undefined;
  const pattern =
    typeof parameters["pattern"] === "string"
      ? parameters["pattern"]
      : undefined;

  const base =
    name === "read_file"
      ? `Reading ${path ?? "file"}`
      : name === "write_file"
        ? `Writing ${path ?? "file"}`
        : name === "str_replace"
          ? `Editing ${path ?? "file"}`
          : name === "list_directory"
            ? `Reading folder ${path ?? "."}`
            : name === "search_files"
              ? pattern
                ? `Finding files matching ${pattern}`
                : "Finding files"
              : name === "search_text"
                ? query
                ? `Searching code for "${truncateText(query, 48)}"`
                : "Searching code"
                : name === "glob"
                  ? pattern
                    ? `Finding files matching ${pattern}`
                    : "Finding files"
                  : name === "code_search"
                    ? query
                      ? `Searching code for "${truncateText(query, 48)}"`
                      : "Searching code"
                    : name === "read_subtree"
                      ? `Reading subtree ${path ?? "."}`
                      : name === "write_todos"
                        ? "Updating the task plan"
                        : name === "run_terminal_command"
                          ? "Running a terminal command"
                          : name === "spawn_agent"
                            ? `Spawning ${String(parameters["agent"] ?? "agent")}`
                            : name === "spawn_agents"
                              ? "Spawning parallel agents"
                              : name === "set_output"
                                ? "Setting structured output"
                                : name === "set_messages"
                                  ? "Updating conversation state"
                                  : name === "task_completed"
                                    ? "Marking the task complete"
                                    : name === "suggest_followups"
                                      ? "Preparing follow-up suggestions"
                                      : name === "lookup_agent_info"
                                        ? `Inspecting agent ${String(parameters["agent"] ?? "info")}`
                                        : name === "ask_user"
                                          ? "Preparing a clarification question"
                                          : name === "web_search"
                                            ? query
                                              ? `Searching the web for "${truncateText(query, 48)}"`
                                              : "Searching the web"
                                            : name === "read_docs"
                                              ? `Reading docs from ${String(parameters["source"] ?? "source")}`
                                              : name === "apply_patch"
                                                ? "Applying a patch"
                : name === "get_cwd"
                  ? "Checking the working directory"
                  : `Running ${name}`;

  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (name === "read_file") {
      const lines = parsed["lines"] as number | undefined;
      const truncated = parsed["truncated"] === true ? ", truncated" : "";
      return `${base} — ${lines ?? "?"} lines${truncated}`;
    }
    if (name === "list_directory") {
      const entries = parsed["entries"] as unknown[] | undefined;
      return `${base} — ${entries?.length ?? "?"} entries`;
    }
    if (name === "search_files") {
      const count = parsed["count"] as number | undefined;
      return `${base} — ${count ?? "?"} matches`;
    }
    if (name === "glob") {
      const count = parsed["count"] as number | undefined;
      return `${base} — ${count ?? "?"} matches`;
    }
    if (name === "search_text") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${base} — ${matches?.length ?? "?"} matches`;
    }
    if (name === "code_search") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${base} — ${matches?.length ?? "?"} matches`;
    }
    if (name === "str_replace") {
      const changed = parsed["linesChanged"] as number | undefined;
      return `${base} — ${changed ?? "?"} lines changed`;
    }
    if (name === "write_file") return `${base} — done`;
    if (name === "apply_patch") return `${base} — done`;
    if (name === "read_subtree") return `${base} — done`;
    if (name === "write_todos") return `${base} — done`;
    if (name === "run_terminal_command") {
      const exitCode = parsed["exitCode"] as number | undefined;
      return `${base} — exit ${exitCode ?? "?"}`;
    }
    if (name === "spawn_agent") return `${base} — done`;
    if (name === "spawn_agents") {
      const results = Array.isArray(parsed) ? parsed : [];
      return `${base} — ${results.length} agents`;
    }
    if (name === "set_output") return `${base} — done`;
    if (name === "set_messages") return `${base} — done`;
    if (name === "task_completed") return `${base} — done`;
    if (name === "suggest_followups") return `${base} — done`;
    if (name === "lookup_agent_info") return `${base} — done`;
    if (name === "ask_user") return `${base} — queued`;
    if (name === "web_search") {
      const count = parsed["count"] as number | undefined;
      return `${base} — ${count ?? "?"} results`;
    }
    if (name === "read_docs") return `${base} — done`;
    if (name === "get_cwd") return base;
  } catch {
    return base;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Internal slot types
// ---------------------------------------------------------------------------

interface EntrySlot {
  entry: LogEntry | null;
}

interface SectionState {
  slotIdx: number;
}

interface PendingTool {
  name: string;
  parameters: Record<string, unknown>;
  slotIdx: number;
  label?: string;
}

interface ThinkState {
  buffer: string;
  slotIdx: number;
}

interface PendingModelCall {
  turn: number;
  slotIdx: number;
}

interface NarrationState {
  buffer: string;
  slotIdx: number;
}

// ---------------------------------------------------------------------------
// LogDeriver — stateful incremental event processor
//
// Each call to processEvent() updates internal state in O(1).
// getLog() materialises the current LogEntry[] in O(slots).
// reset() clears all state for a fresh run.
// ---------------------------------------------------------------------------

export class LogDeriver {
  private slots: EntrySlot[] = [];
  private sections = new Map<string, SectionState>();
  private thinkStates = new Map<string, ThinkState>();
  private pendingModelCalls = new Map<string, PendingModelCall>();
  private narrationStates = new Map<string, NarrationState>();
  private pendingTools = new Map<string, PendingTool>();
  private streamSlotIdx: number | null = null;
  private streamAgentId: string | null = null;
  private streamRawBuffer = "";
  private pendingDiffs = new Map<string, { filePath: string; diff: DiffEntry }>();
  private lastStatusSlotIdx: number | null = null;
  private lastStatusMessage = "";
  private nextSlotIdx: number | null = null; // single global replaceable slot
  private narrativeNextReceived = false;
  private lastAgentIntent: string | null = null;

  // ── Private helpers ────────────────────────────────────────────────────────

  private push(entry: LogEntry): number {
    const idx = this.slots.length;
    this.slots.push({ entry });
    return idx;
  }

  private evict(idx: number): void {
    if (this.slots[idx]) this.slots[idx]!.entry = null;
  }

  private update(
    idx: number,
    updater: (entry: LogEntry) => Partial<LogEntry>,
  ): void {
    const slot = this.slots[idx];
    if (!slot?.entry) return;
    slot.entry = { ...slot.entry, ...updater(slot.entry) };
  }

  /**
   * Mid-stream cleaner for visible streaming output.
   * It removes tool protocol and reasoning tags, including incomplete trailing
   * blocks, so internal markup never flashes in the transcript while streaming.
   */
  private cleanStreamContent(raw: string): string {
    let s = raw;
    // Suppress if it looks like a streaming JSON block (orchestrator/internal protocol)
    if (s.trim().startsWith("{")) return "";

    return s
      .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_(?:call|result)>/gi, "")
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
      .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, "")
      .replace(/<next\b[^>]*>[\s\S]*?<\/next>/gi, "")
      .replace(/<\/?(?:tool_call|tool_result|think|status|next)\b[^>]*>/gi, "")
      .replace(/<\/?(?:tool_call|think|status|next)\b[\s\S]*$/gi, "")
      .replace(/<\/?[a-z]*$/gi, "")
      .replace(/\n{3,}/g, "\n\n");
  }

  private sanitizeNarrationLine(text: string): string {
    const cleaned = text
      .replace(/<(?:tool_call|tool_result|think|status|next)\b[^>]*>/gi, "")
      .replace(/<\/(?:tool_call|tool_result|think|status|next)>/gi, "")
      .trim();

    if (!cleaned) return "";
    if (/^<tool_/i.test(cleaned) || /^<\/tool_/i.test(cleaned)) return "";
    if (/^\{[\s\S]*\}$/.test(cleaned)) {
      try {
        JSON.parse(cleaned);
        return "";
      } catch {
        // Keep non-JSON braces content if parsing fails.
      }
    }
    return cleaned;
  }

  private stripNarrationProtocol(text: string): string {
    return text
      .replace(
        /<(?:tool_call|tool_result|think|status|next)\b[^>]*>[\s\S]*?<\/(?:tool_call|tool_result|think|status|next)>/gi,
        "\n",
      )
      .replace(
        /<(?:tool_call|tool_result|think|status|next)\b[^>]*>[\s\S]*$/gi,
        "\n",
      )
      .replace(/^\s*\{[\s\S]*?\}\s*$/gm, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  private findNarrationBoundary(text: string): number {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\n") return i + 1;
      if (ch === "." || ch === "!" || ch === "?") {
        const next = text[i + 1];
        if (next === undefined || /\s/.test(next)) return i + 1;
      }
    }
    return -1;
  }

  private finalizeNarration(agentId: string): void {
    const narration = this.narrationStates.get(agentId);
    if (!narration) return;

    const message = this.sanitizeNarrationLine(narration.buffer);
    if (message) {
      this.update(narration.slotIdx, () => ({ message, done: true }));
    } else {
      this.evict(narration.slotIdx);
    }
    this.narrationStates.delete(agentId);
  }

  private appendNarrationChunk(
    agentId: string,
    chunk: string,
    time: string,
    eventId: string,
  ): void {
    let remaining = this.stripNarrationProtocol(chunk);
    while (remaining.length > 0) {
      const boundaryIdx = this.findNarrationBoundary(remaining);
      const piece =
        boundaryIdx === -1 ? remaining : remaining.slice(0, boundaryIdx);
      const rest = boundaryIdx === -1 ? "" : remaining.slice(boundaryIdx);

      const existing = this.narrationStates.get(agentId);
      const nextBuffer = `${existing?.buffer ?? ""}${piece}`;
      const sanitized = this.sanitizeNarrationLine(nextBuffer);

      if (existing) {
        this.update(existing.slotIdx, () => ({
          message: sanitized,
          done: false,
        }));
        this.narrationStates.set(agentId, { ...existing, buffer: nextBuffer });
      } else if (sanitized) {
        const slotIdx = this.push({
          id: `${eventId}-narration-${this.slots.length}`,
          time,
          level: "narration",
          message: sanitized,
          done: false,
        });
        this.narrationStates.set(agentId, { buffer: nextBuffer, slotIdx });
      }

      if (boundaryIdx !== -1) {
        this.finalizeNarration(agentId);
      }

      remaining = rest.replace(/^\s+/, "");
    }
  }

  private flushActiveStream(
    time: string,
    finalLevel: LogEntry["level"] = "response",
  ): boolean {
    if (this.streamSlotIdx === null) return false;

    const slotIdx = this.streamSlotIdx;
    const rawSnapshot = this.streamRawBuffer;
    const existingEntry = this.slots[slotIdx]?.entry;
    const cleaned = cleanAgentResponse(rawSnapshot);

    this.evict(slotIdx);
    this.streamSlotIdx = null;
    this.streamAgentId = null;
    this.streamRawBuffer = "";

    if (cleaned && finalLevel !== "stream") {
      this.push({
        id: existingEntry?.id
          ? `${existingEntry.id}-final`
          : `stream-final-${this.slots.length}`,
        time,
        level: finalLevel,
        message: cleaned,
      });
    }

    this.streamSlotIdx = null;
    this.streamAgentId = null;
    this.streamRawBuffer = "";
    return Boolean(cleaned);
  }

  private finalizeAll(): void {
    const time = fmtTime(Date.now());
    this.flushActiveStream(time, "response");

    // Mark status rows as done so they appear in history if needed, rather than evicting.
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.slots[i]?.entry;
      if (entry?.level === "status") {
        this.update(i, () => ({ done: true }));
      }
    }

    for (const [agentId, state] of this.thinkStates) {
      const full = state.buffer.trim();
      if (full) {
        this.update(state.slotIdx, () => ({ message: full, finished: true }));
      } else {
        this.evict(state.slotIdx);
      }
      this.thinkStates.delete(agentId);
    }

    for (const [, pending] of this.pendingModelCalls) {
      this.update(pending.slotIdx, () => ({ done: true }));
    }
    this.pendingModelCalls.clear();

    for (const [agentId] of this.narrationStates) {
      this.finalizeNarration(agentId);
    }

    for (const [agentId, section] of this.sections) {
      this.update(section.slotIdx, () => ({ finished: true }));
      this.sections.delete(agentId);
    }

    for (const [, pending] of this.pendingTools) {
      this.update(pending.slotIdx, () => ({ done: true }));
    }
    this.pendingTools.clear();

    // Evict the next-reply slot — run is over, "what's next" is no longer relevant.
    if (this.nextSlotIdx !== null) {
      this.evict(this.nextSlotIdx);
      this.nextSlotIdx = null;
    }
  }

  private finalizeThinking(agentId: string): void {
    const think = this.thinkStates.get(agentId);
    if (!think) return;

    const full = think.buffer.trim();
    if (full) {
      this.update(think.slotIdx, () => ({ message: full, finished: true }));
    } else {
      this.evict(think.slotIdx);
    }
    this.thinkStates.delete(agentId);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  processEvent(event: RunEvent): void {
    const time = fmtTime(event.timestamp);

    switch (event.type) {
      case "run_started":
        this.nextSlotIdx = this.push({
          id: "next-slot",
          time,
          level: "next",
          message: "",
          done: false,
        });
        break;

      case "user_message":
        this.push({
          id: `${event.eventId}-user`,
          time,
          level: "user",
          message: event.content,
        });
        break;

      case "agent_started": {
        this.finalizeNarration(event.agentId);
        const slotIdx = this.push({
          id: `${event.eventId}-section`,
          time,
          level: "section",
          message: describeSectionStart(event.agentId, event.task),
          finished: false,
        });
        this.sections.set(event.agentId, { slotIdx });
        this.thinkStates.delete(event.agentId);
        break;
      }

      case "model_call_started": {
        this.finalizeNarration(event.agentId);
        const slotIdx = this.push({
          id: `${event.eventId}-model`,
          time,
          level: "model",
          title: `LLM call ${event.turn}`,
          message: cleanAgentResponse(event.summary),
          done: false,
        });
        this.pendingModelCalls.set(`${event.agentId}:${event.turn}`, {
          turn: event.turn,
          slotIdx,
        });
        this.narrativeNextReceived = false;
        break;
      }

      case "model_call_completed": {
        const key = `${event.agentId}:${event.turn}`;
        const pending = this.pendingModelCalls.get(key);
        if (!pending) break;
        this.update(pending.slotIdx, () => ({
          title: `LLM call ${event.turn}`,
          message: describeModelTurnDone(
            event.turn,
            cleanAgentResponse(event.summary),
          ),
          ...(event.detail ? { detail: event.detail } : {}),
          done: true,
        }));
        this.pendingModelCalls.delete(key);
        
        const summaryMsg = cleanAgentResponse(event.summary) || "";
        this.lastAgentIntent = summaryMsg;
        break;
      }

      case "reasoning_delta": {
        const existing = this.thinkStates.get(event.agentId);
        if (existing) {
          const buffer = existing.buffer + event.delta;
          const snippet =
            buffer.length > 300 ? `…${buffer.slice(-300)}` : buffer;
          this.update(existing.slotIdx, () => ({ message: snippet }));
          this.thinkStates.set(event.agentId, { ...existing, buffer });
        } else {
          const buffer = event.delta;
          const snippet =
            buffer.length > 300 ? `…${buffer.slice(-300)}` : buffer;
          const slotIdx = this.push({
            id: `${event.eventId}-think`,
            time,
            level: "think",
            message: snippet,
            finished: false,
          });
          this.thinkStates.set(event.agentId, { buffer, slotIdx });
        }
        break;
      }

      case "status_update": {
        const statusMessage = summarizeSentence(event.message, 96);
        const statusSlotIdx = this.push({
          id: `${event.eventId}-status`,
          time,
          level: "status",
          message: statusMessage,
        });
        this.lastStatusSlotIdx = statusSlotIdx;
        this.lastStatusMessage = statusMessage;
        
        // Caching this allows the next tool_call_completed to fall back to this status
        // instead of going completely blank.
        if (statusMessage) this.lastAgentIntent = statusMessage;
        break;
      }

      case "next_update": {
        // Single global slot — update in-place while streaming, push once if new.
        const msg = event.message.trim().slice(0, 600);
        if (!msg) break; // skip empty/whitespace messages
        this.narrativeNextReceived = true;
        if (this.nextSlotIdx !== null) {
          this.update(this.nextSlotIdx, () => ({ message: msg, time }));
        } else {
          this.nextSlotIdx = this.push({
            id: "next-slot",
            time,
            level: "next",
            message: msg,
            done: false,
          });
        }
        break;
      }

      case "text_delta": {
        // A status not consumed by a tool call stays visible (e.g. "Preparing final explanation").
        this.lastStatusSlotIdx = null;
        this.lastStatusMessage = "";

        // Keep file-picker output buffered; its intermediate output is usually
        // internal exploration rather than directly user-facing prose.
        if (event.agentId === "file-picker") {
          break;
        }

        // Only buffer the output invisibly. We intentionally suppress live streaming (SSE)
        // for intermediate steps so that the terminal displays them in unified blocks instead.
        // The final user-facing response will be streamed properly via 'response_delta'.
        this.finalizeThinking(event.agentId);
        this.streamRawBuffer += event.content;
        this.streamAgentId = event.agentId;
        break;
      }

      case "response_delta": {
        // This is used ONLY for the final conversational response to the user.
        // It provides the SSE / 'typing' effect that was suppressed during narration.
        const time = fmtTime(event.timestamp);
        this.finalizeThinking(event.agentId);

        // Instantly hide the <next> progress line while we stream the final answer
        if (this.nextSlotIdx !== null) {
          this.update(this.nextSlotIdx, () => ({ message: "" }));
        }

        this.streamRawBuffer += event.content;
        const cleanedContent = this.cleanStreamContent(this.streamRawBuffer);

        if (this.streamSlotIdx !== null) {
          this.update(this.streamSlotIdx, () => ({ message: cleanedContent }));
        } else {
          this.streamSlotIdx = this.push({
            id: `final-response-stream`,
            time,
            level: "response",
            message: cleanedContent,
          });
          this.streamAgentId = event.agentId;
        }
        break;
      }

      case "tool_call_started": {
        this.finalizeNarration(event.agentId);

        // Discard any active stream from intermediate model text before this tool call.
        if (this.streamSlotIdx !== null) {
          this.evict(this.streamSlotIdx);
          this.streamSlotIdx = null;
          this.streamAgentId = null;
          this.streamRawBuffer = "";
        }

        let bulletLabel = describeToolCallActive(event.name, event.parameters);
        if (this.lastStatusSlotIdx !== null) {
          // Fold the latest short status into the tool bullet and remove the
          // standalone status row to avoid duplicate "Reading..." lines.
          if (this.lastStatusMessage) {
            bulletLabel = this.lastStatusMessage;
          }
          this.evict(this.lastStatusSlotIdx);
          this.lastStatusSlotIdx = null;
          this.lastStatusMessage = "";
        }

        this.pendingTools.set(event.toolCallId, {
          name: event.name,
          parameters: event.parameters,
          slotIdx: this.push({
            id: `${event.eventId}-bullet-active`,
            time,
            level: "bullet",
            message: bulletLabel,
            done: false,
          }),
          label: bulletLabel,
        });
        break;
      }

      case "tool_call_completed": {
        const pending = this.pendingTools.get(event.toolCallId);
        if (!pending) break;

        if (event.error) {
          this.update(pending.slotIdx, () => ({
            id: `${event.eventId}-bullet-failed`,
            time,
            message: `${pending.label ?? describeToolCallActive(event.name, event.parameters)} — failed`,
            failed: true,
            done: true,
          }));
          this.push({
            id: `${event.eventId}-error`,
            time,
            level: "error",
            message: describeToolError(
              event.name,
              event.parameters,
              event.error,
            ),
          });
        } else {
          const detail = buildToolCallDetail(
            event.name,
            event.parameters,
            event.output,
          );
          let doneMessage: string;
          if (pending.label) {
            const pathBased = describeToolCallDone(
              event.name,
              event.parameters,
              event.output,
            );
            const dashIdx = pathBased.indexOf(" — ");
            const suffix = dashIdx !== -1 ? pathBased.slice(dashIdx) : "";
            doneMessage = `${pending.label}${suffix}`;
          } else {
            doneMessage = describeToolCallDone(
              event.name,
              event.parameters,
              event.output,
            );
          }
          this.update(pending.slotIdx, () => ({
            id: `${event.eventId}-bullet`,
            time,
            message: doneMessage,
            done: true,
            failed: false,
            ...(detail !== undefined ? { detail } : { detail: undefined }),
          }));
        }

        const pendingDiff = this.pendingDiffs.get(event.toolCallId);
        if (pendingDiff && !event.error) {
          this.push({
            id: `${event.eventId}-diff-${pendingDiff.filePath}`,
            time,
            level: "diff",
            message: pendingDiff.filePath,
            diff: pendingDiff.diff,
          });
        }
        this.pendingDiffs.delete(event.toolCallId);
        this.pendingTools.delete(event.toolCallId);
        break;
      }

      case "agent_completed": {
        this.finalizeNarration(event.agentId);
        this.finalizeThinking(event.agentId);

        const section = this.sections.get(event.agentId);
        if (section) {
          const summary = summarizeAgentOutput(event.agentId, event.output);
          this.update(section.slotIdx, () => ({
            finished: true,
            ...(summary ? { detail: summary } : {}),
          }));
          this.sections.delete(event.agentId);
        }

        if (
          this.streamSlotIdx !== null &&
          this.streamAgentId === event.agentId
        ) {
          this.flushActiveStream(time, "response");
        }
        break;
      }

      case "diff_collected":
        this.pendingDiffs.set(event.toolCallId, {
          filePath: event.filePath,
          diff: event.diff,
        });
        break;

      case "run_completed": {
        if (this.streamSlotIdx !== null) {
          this.update(this.streamSlotIdx, () => ({ done: true }));
          this.streamSlotIdx = null; // Detach so it's not flushed again
        } else {
          // Only fall back to finalOutput if no response was already streamed live
          const hasResponse = this.slots.some(
            (s) => s.entry?.level === "response",
          );
          if (!hasResponse) {
            const cleaned = cleanAgentResponse(event.finalOutput.trim());
            if (cleaned) {
              this.push({
                id: `${event.eventId}-response`,
                time,
                level: "response",
                message: cleaned,
              });
            }
          }
        }

        this.finalizeAll();

        for (const { filePath, diff } of this.pendingDiffs.values()) {
          this.push({
            id: `${event.eventId}-diff-${filePath}`,
            time,
            level: "diff",
            message: filePath,
            diff,
          });
        }
        this.pendingDiffs.clear();
        break;
      }

      case "run_failed":
        this.finalizeAll();
        this.push({
          id: `${event.eventId}-error`,
          time,
          level: "error",
          message: event.message,
        });
        break;

      case "run_interrupted":
        this.finalizeAll();
        this.push({
          id: `${event.eventId}-interrupted`,
          time,
          level: "info",
          message:
            event.source === "keyboard"
              ? "Run terminated by keyboard."
              : "Run terminated.",
        });
        break;
    }
  }

  reset(): void {
    this.slots = [];
    this.sections.clear();
    this.thinkStates.clear();
    this.pendingModelCalls.clear();
    this.narrationStates.clear();
    this.pendingTools.clear();
    this.streamSlotIdx = null;
    this.streamAgentId = null;
    this.streamRawBuffer = "";
    this.pendingDiffs.clear();
    this.lastStatusSlotIdx = null;
    this.lastStatusMessage = "";
    this.nextSlotIdx = null;
    this.narrativeNextReceived = false;
  }

  getLog(): LogEntry[] {
    return this.slots.flatMap((slot) => (slot.entry ? [slot.entry] : []));
  }

  lookupPendingToolParams(
    toolCallId: string,
  ): Record<string, unknown> | undefined {
    return this.pendingTools.get(toolCallId)?.parameters;
  }
}

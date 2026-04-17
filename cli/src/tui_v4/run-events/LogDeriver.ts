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

  // Strip pure JSON wrapper (existing behavior) — recurse to also clean extracted value
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>;
      for (const key of ["direct_answer", "answer", "content", "response", "text", "message", "output"]) {
        const val = parsed[key];
        if (typeof val === "string" && val.trim()) return cleanAgentResponse(val.trim());
      }
      return ""; // pure internal JSON with no displayable content
    } catch {
      // Not valid JSON — fall through to XML stripping
    }
  }

  // Strip complete <tool_call name="...">...</tool_result> or ...</tool_call> blocks.
  // The LLM sometimes narrates its tool calls as XML in the response body.
  s = s.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_(?:call|result)>/gi, "");

  // Strip complete reasoning blocks that leaked into visible output.
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");

  // Strip orphaned opening tags (no matching close)
  s = s.replace(/<tool_call\b[^>]*>/gi, "");
  s = s.replace(/<think\b[^>]*>/gi, "");

  // Strip orphaned closing tags
  s = s.replace(/<\/tool_(?:call|result)>/gi, "");
  s = s.replace(/<\/think>/gi, "");

  // Strip any incomplete think block that has started but not closed yet.
  s = s.replace(/<think\b[\s\S]*$/gi, "");

  // Collapse 3+ consecutive blank lines → 2
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

function describeSectionStart(agentId: string): string {
  switch (agentId) {
    case "orchestrator": return "Planning task";
    case "file-picker": return "Exploring codebase";
    case "reader": return "Reading and analyzing files";
    case "executor": return "Implementing changes";
    default: return "Working";
  }
}

function describeToolCallActive(name: string, parameters: Record<string, unknown>): string {
  const path = typeof parameters["path"] === "string" ? cleanPath(parameters["path"]) : undefined;
  const query = typeof parameters["query"] === "string" ? parameters["query"] : undefined;
  const pattern = typeof parameters["pattern"] === "string" ? parameters["pattern"] : undefined;

  switch (name) {
    case "read_file": return `Read ${path ?? "file"}`;
    case "write_file": return `Write ${path ?? "file"}`;
    case "str_replace": return `Edit ${path ?? "file"}`;
    case "list_directory": return `List ${path ?? "."}`;
    case "search_files": return pattern ? `Find files matching ${pattern}` : "Find files";
    case "search_text": return query ? `Search code for "${truncateText(query, 48)}"` : "Search code";
    case "get_cwd": return "Check working directory";
    default: return `Run ${name}`;
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
      const entries = parsed["entries"] as Array<{ name: string; type: "file" | "directory" }> | undefined;
      if (!entries?.length) return undefined;
      const shown = entries.slice(0, 8).map((e) => e.type === "directory" ? `${e.name}/` : e.name);
      if (entries.length > shown.length) shown.push(`… ${entries.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "search_files") {
      const files = parsed["files"] as string[] | undefined;
      if (!files?.length) return undefined;
      const shown = files.slice(0, 6).map((f) => cleanPath(f));
      if (files.length > shown.length) shown.push(`… ${files.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "search_text") {
      const matches = parsed["matches"] as Array<{ file?: string; line?: number; text?: string }> | undefined;
      if (!matches?.length) return undefined;
      const shown = matches.slice(0, 5).map((m) => {
        const file = typeof m.file === "string" ? cleanPath(m.file) : "file";
        const line = typeof m.line === "number" && m.line > 0 ? `:${m.line}` : "";
        const snippet = typeof m.text === "string" ? truncateText(normalizeWhitespace(m.text)) : "";
        return snippet ? `${file}${line}  ${snippet}` : `${file}${line}`;
      });
      if (matches.length > shown.length) shown.push(`… ${matches.length - shown.length} more`);
      return shown.join("\n");
    }

    if (name === "get_cwd") {
      const cwd = typeof parsed["cwd"] === "string" ? parsed["cwd"] : undefined;
      return cwd ? cleanPath(cwd) : undefined;
    }

    if (name === "read_file") {
      const lines = typeof parsed["lines"] === "number" ? parsed["lines"] : undefined;
      const truncated = parsed["truncated"] === true ? "truncated" : undefined;
      const path = typeof parameters["path"] === "string" ? cleanPath(parameters["path"]) : undefined;
      return [path, lines !== undefined ? `${lines} lines` : undefined, truncated].filter(Boolean).join("\n") || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function describeToolError(name: string, parameters: Record<string, unknown>, error: string): string {
  const path = typeof parameters["path"] === "string" ? cleanPath(parameters["path"]) : undefined;

  if (error === `${name}: 'path' is required`) {
    if (name === "read_file") return "Couldn't read a file — no path provided.";
    if (name === "write_file") return "Couldn't write a file — no path provided.";
    if (name === "str_replace") return "Couldn't edit a file — no path provided.";
  }
  if (error === "write_file: 'content' is required") return "Couldn't write file — no content provided.";
  if (error === "str_replace: 'old_string' is required") return "Couldn't edit file — replacement source missing.";
  if (error === "str_replace: 'new_string' is required") return "Couldn't edit file — replacement target missing.";
  if (error === "search_files: 'pattern' is required") return "Couldn't search files — no pattern provided.";
  if (error === "search_text: 'query' is required") return "Couldn't search code — no query provided.";

  const missingFile = /^read_file: not found: (.+)$/.exec(error);
  if (missingFile) return `Not found: ${cleanPath(missingFile[1] ?? path ?? "that file")}`;

  const missingDir = /^list_directory: not found: (.+)$/.exec(error);
  if (missingDir) return `Directory not found: ${cleanPath(missingDir[1] ?? path ?? ".")}`;

  const missingEditFile = /^str_replace: file not found: (.+)$/.exec(error);
  if (missingEditFile) return `Not found: ${cleanPath(missingEditFile[1] ?? path ?? "that file")}`;

  const directoryMatch = /^read_file: '(.+)' is a directory/.exec(error);
  if (directoryMatch) return `${cleanPath(directoryMatch[1] ?? path ?? "That path")} is a directory.`;

  const oldStringMatch = /^str_replace: old_string not found in (.+)\./.exec(error);
  if (oldStringMatch) return `Text to replace not found in ${cleanPath(oldStringMatch[1] ?? path ?? "that file")}.`;

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

  const path = typeof parameters["path"] === "string" ? cleanPath(parameters["path"]) : undefined;
  const query = typeof parameters["query"] === "string" ? parameters["query"] : undefined;
  const pattern = typeof parameters["pattern"] === "string" ? parameters["pattern"] : undefined;

  const base =
    name === "read_file" ? `Read ${path ?? "file"}` :
    name === "write_file" ? `Write ${path ?? "file"}` :
    name === "str_replace" ? `Edit ${path ?? "file"}` :
    name === "list_directory" ? `List ${path ?? "."}` :
    name === "search_files" ? (pattern ? `Find files matching ${pattern}` : "Find files") :
    name === "search_text" ? (query ? `Search code for "${truncateText(query, 48)}"` : "Search code") :
    name === "get_cwd" ? "Check working directory" :
    `Run ${name}`;

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
    if (name === "search_text") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${base} — ${matches?.length ?? "?"} matches`;
    }
    if (name === "str_replace") {
      const changed = parsed["linesChanged"] as number | undefined;
      return `${base} — ${changed ?? "?"} lines changed`;
    }
    if (name === "write_file") return `${base} — done`;
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
}

interface ThinkState {
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
  private pendingTools = new Map<string, PendingTool>();
  private streamSlotIdx: number | null = null;
  private streamAgentId: string | null = null;
  private streamRawBuffer = "";
  private pendingDiffs: Array<{ filePath: string; diff: DiffEntry }> = [];

  // ── Private helpers ────────────────────────────────────────────────────────

  private push(entry: LogEntry): number {
    const idx = this.slots.length;
    this.slots.push({ entry });
    return idx;
  }

  private evict(idx: number): void {
    if (this.slots[idx]) this.slots[idx]!.entry = null;
  }

  private update(idx: number, updater: (entry: LogEntry) => Partial<LogEntry>): void {
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
    return raw
      .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_(?:call|result)>/gi, "")
      .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
      .replace(/<tool_call\b[^>]*>/gi, "")
      .replace(/<\/tool_(?:call|result)>/gi, "")
      .replace(/<think\b[^>]*>/gi, "")
      .replace(/<\/think>/gi, "")
      .replace(/<tool_call\b[\s\S]*$/gi, "")
      .replace(/<think\b[\s\S]*$/gi, "")
      .replace(/\n{3,}/g, "\n\n");
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

    if (
      cleaned &&
      finalLevel !== "stream"
    ) {
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

    for (const [agentId, state] of this.thinkStates) {
      const full = state.buffer.trim();
      if (full) {
        this.update(state.slotIdx, () => ({ message: full, finished: true }));
      } else {
        this.evict(state.slotIdx);
      }
      this.thinkStates.delete(agentId);
    }

    for (const [agentId, section] of this.sections) {
      this.update(section.slotIdx, () => ({ finished: true }));
      this.sections.delete(agentId);
    }

    for (const [, pending] of this.pendingTools) {
      this.update(pending.slotIdx, () => ({ done: true }));
    }
    this.pendingTools.clear();
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
        break;

      case "user_message":
        this.push({ id: `${event.eventId}-user`, time, level: "user", message: event.content });
        break;

      case "agent_started": {
        const slotIdx = this.push({
          id: `${event.eventId}-section`,
          time,
          level: "section",
          message: describeSectionStart(event.agentId),
          finished: false,
        });
        this.sections.set(event.agentId, { slotIdx });
        this.thinkStates.delete(event.agentId);
        break;
      }

      case "reasoning_delta": {
        const existing = this.thinkStates.get(event.agentId);
        if (existing) {
          const buffer = existing.buffer + event.delta;
          const snippet = buffer.length > 300 ? `…${buffer.slice(-300)}` : buffer;
          this.update(existing.slotIdx, () => ({ message: snippet }));
          this.thinkStates.set(event.agentId, { ...existing, buffer });
        } else {
          const buffer = event.delta;
          const snippet = buffer.length > 300 ? `…${buffer.slice(-300)}` : buffer;
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

      case "text_delta": {
        this.finalizeThinking(event.agentId);

        if (
          this.streamSlotIdx !== null &&
          this.streamAgentId !== null &&
          this.streamAgentId !== event.agentId
        ) {
          this.flushActiveStream(time, "response");
        }

        this.streamRawBuffer += event.content;
        const cleanedContent = this.cleanStreamContent(this.streamRawBuffer);

        if (this.streamSlotIdx !== null) {
          this.update(this.streamSlotIdx, () => ({ message: cleanedContent }));
        } else {
          this.streamSlotIdx = this.push({
            id: `${event.agentId}-stream`,
            time,
            level: "stream",
            message: cleanedContent,
          });
          this.streamAgentId = event.agentId;
        }
        break;
      }

      case "tool_call_started": {
        const slotIdx = this.push({
          id: `${event.toolCallId}-bullet`,
          time,
          level: "bullet",
          message: describeToolCallActive(event.name, event.parameters),
          done: false,
        });
        this.pendingTools.set(event.toolCallId, {
          name: event.name,
          parameters: event.parameters,
          slotIdx,
        });
        break;
      }

      case "tool_call_completed": {
        const pending = this.pendingTools.get(event.toolCallId);
        if (!pending) break;

        if (event.error) {
          this.update(pending.slotIdx, () => ({
            message: `${describeToolCallActive(event.name, event.parameters)} — failed`,
            done: true,
          }));
          this.push({
            id: `${event.toolCallId}-error`,
            time,
            level: "error",
            message: describeToolError(event.name, event.parameters, event.error),
          });
        } else {
          const detail = buildToolCallDetail(event.name, event.parameters, event.output);
          this.update(pending.slotIdx, () => ({
            message: describeToolCallDone(event.name, event.parameters, event.output),
            done: true,
            ...(detail !== undefined ? { detail } : {}),
          }));
        }

        this.pendingTools.delete(event.toolCallId);
        break;
      }

      case "agent_completed": {
        this.finalizeThinking(event.agentId);

        const section = this.sections.get(event.agentId);
        if (section) {
          this.update(section.slotIdx, () => ({ finished: true }));
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
        this.pendingDiffs.push({ filePath: event.filePath, diff: event.diff });
        break;

      case "run_completed": {
        if (this.streamSlotIdx !== null) {
          this.flushActiveStream(time, "response");
        } else {
          const cleaned = cleanAgentResponse(event.finalOutput.trim());
          if (cleaned) {
            this.push({ id: `${event.eventId}-response`, time, level: "response", message: cleaned });
          }
        }

        this.finalizeAll();

        for (const { filePath, diff } of this.pendingDiffs) {
          this.push({
            id: `${event.eventId}-diff-${filePath}`,
            time,
            level: "diff",
            message: filePath,
            diff,
          });
        }
        this.pendingDiffs.length = 0;
        break;
      }

      case "run_failed":
        this.finalizeAll();
        this.push({ id: `${event.eventId}-error`, time, level: "error", message: event.message });
        break;

      case "run_interrupted":
        this.finalizeAll();
        break;
    }
  }

  reset(): void {
    this.slots = [];
    this.sections.clear();
    this.thinkStates.clear();
    this.pendingTools.clear();
    this.streamSlotIdx = null;
    this.streamAgentId = null;
    this.streamRawBuffer = "";
    this.pendingDiffs = [];
  }

  getLog(): LogEntry[] {
    return this.slots.flatMap((slot) => (slot.entry ? [slot.entry] : []));
  }

  lookupPendingToolParams(toolCallId: string): Record<string, unknown> | undefined {
    return this.pendingTools.get(toolCallId)?.parameters;
  }
}

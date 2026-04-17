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
  const normalized = normalizeWhitespace(text);
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
  s = s.replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, "");

  // Strip orphaned opening tags (no matching close)
  s = s.replace(/<tool_call\b[^>]*>/gi, "");
  s = s.replace(/<think\b[^>]*>/gi, "");
  s = s.replace(/<status\b[^>]*>/gi, "");

  // Strip orphaned closing tags
  s = s.replace(/<\/tool_(?:call|result)>/gi, "");
  s = s.replace(/<\/think>/gi, "");
  s = s.replace(/<\/status>/gi, "");

  // Strip any incomplete think block that has started but not closed yet.
  s = s.replace(/<think\b[\s\S]*$/gi, "");

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
      return broadRepoRead ? "Understanding the request" : "Planning the next step";
    case "file-picker":
      return broadRepoRead ? "Mapping the repository structure" : "Finding the relevant files";
    case "reader":
      return broadRepoRead ? "Reading key files across the repository" : "Reading the relevant files";
    case "executor":
      return userTask.includes("read ") || userTask.includes("explain")
        ? "Preparing the final explanation"
        : "Implementing the requested change";
    default:
      return "Working on the task";
  }
}

function summarizeAgentOutput(agentId: string, output: string): string | undefined {
  const cleaned = cleanAgentResponse(output);
  if (!cleaned) return undefined;

  const firstLine = cleaned.split("\n").map((line) => normalizeWhitespace(line)).find(Boolean) ?? "";
  if (!firstLine) return undefined;

  if (agentId === "orchestrator") {
    if (firstLine.includes('"task_type":"read"') || firstLine.includes('"task_type": "read"')) {
      return "Decided to inspect the codebase before answering";
    }
    if (firstLine.includes('"task_type":"write"') || firstLine.includes('"task_type": "write"')) {
      return "Decided that code changes are needed";
    }
    if (firstLine.includes('"task_type":"direct"') || firstLine.includes('"task_type": "direct"')) {
      return "Decided this can be answered directly";
    }
  }

  return summarizeSentence(firstLine, 96);
}

function describeModelTurnDone(turn: number, summary: string): string {
  return summary;
}

function buildReadPreview(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const content = typeof parsed["content"] === "string" ? parsed["content"] : "";
    if (!content) return undefined;

    const preview = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("/*"))
      .slice(0, 3)
      .map((line) => truncateText(line, 96));

    return preview.length > 0 ? preview.join("\n") : undefined;
  } catch {
    return undefined;
  }
}

function describeToolCallActive(name: string, parameters: Record<string, unknown>): string {
  const path = typeof parameters["path"] === "string" ? cleanPath(parameters["path"]) : undefined;
  const query = typeof parameters["query"] === "string" ? parameters["query"] : undefined;
  const pattern = typeof parameters["pattern"] === "string" ? parameters["pattern"] : undefined;

  switch (name) {
    case "read_file": return `Reading ${path ?? "file"}`;
    case "write_file": return `Writing ${path ?? "file"}`;
    case "str_replace": return `Editing ${path ?? "file"}`;
    case "list_directory": return `Reading folder ${path ?? "."}`;
    case "search_files": return pattern ? `Finding files matching ${pattern}` : "Finding files";
    case "search_text": return query ? `Searching code for "${truncateText(query, 48)}"` : "Searching code";
    case "get_cwd": return "Checking the working directory";
    default: return `Running ${name}`;
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
      const preview = buildReadPreview(output);
      return [
        path,
        lines !== undefined ? `${lines} lines` : undefined,
        truncated,
        preview,
      ].filter(Boolean).join("\n") || undefined;
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
    name === "read_file" ? `Reading ${path ?? "file"}` :
    name === "write_file" ? `Writing ${path ?? "file"}` :
    name === "str_replace" ? `Editing ${path ?? "file"}` :
    name === "list_directory" ? `Reading folder ${path ?? "."}` :
    name === "search_files" ? (pattern ? `Finding files matching ${pattern}` : "Finding files") :
    name === "search_text" ? (query ? `Searching code for "${truncateText(query, 48)}"` : "Searching code") :
    name === "get_cwd" ? "Checking the working directory" :
    `Running ${name}`;

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
  private pendingDiffs: Array<{ filePath: string; diff: DiffEntry }> = [];
  private lastStatusSlotIdx: number | null = null;
  private lastStatusMessage = "";
  private nextSlotIdx: number | null = null; // single global replaceable slot

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

  private sanitizeNarrationLine(text: string): string {
    const cleaned = text
      .replace(/<tool_call\b[^>]*>/gi, "")
      .replace(/<\/tool_call>/gi, "")
      .replace(/<tool_result\b[^>]*>/gi, "")
      .replace(/<\/tool_result>/gi, "")
      .replace(/<think\b[^>]*>/gi, "")
      .replace(/<\/think>/gi, "")
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
      .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "\n")
      .replace(/<tool_result\b[^>]*>[\s\S]*?<\/tool_result>/gi, "\n")
      .replace(/<tool_call\b[^>]*>[\s\S]*$/gi, "\n")
      .replace(/<tool_result\b[^>]*>[\s\S]*$/gi, "\n")
      .replace(/^\s*\{[\s\S]*?\}\s*$/gm, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  private findNarrationBoundary(text: string): number {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\n") return i + 1;
      if ((ch === "." || ch === "!" || ch === "?")) {
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

  private appendNarrationChunk(agentId: string, chunk: string, time: string, eventId: string): void {
    let remaining = this.stripNarrationProtocol(chunk);
    while (remaining.length > 0) {
      const boundaryIdx = this.findNarrationBoundary(remaining);
      const piece = boundaryIdx === -1 ? remaining : remaining.slice(0, boundaryIdx);
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
        break;

      case "user_message":
        this.push({ id: `${event.eventId}-user`, time, level: "user", message: event.content });
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
          message: event.summary,
          done: false,
        });
        this.pendingModelCalls.set(`${event.agentId}:${event.turn}`, {
          turn: event.turn,
          slotIdx,
        });
        break;
      }

      case "model_call_completed": {
        const key = `${event.agentId}:${event.turn}`;
        const pending = this.pendingModelCalls.get(key);
        if (!pending) break;
        this.update(pending.slotIdx, () => ({
          title: `LLM call ${event.turn}`,
          message: describeModelTurnDone(event.turn, event.summary),
          ...(event.detail ? { detail: event.detail } : {}),
          done: true,
        }));
        this.pendingModelCalls.delete(key);
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
        break;
      }

      case "next_update": {
        // Single global slot — update in-place while streaming, push once if new.
        const msg = event.message.slice(0, 600);
        if (this.nextSlotIdx !== null) {
          this.update(this.nextSlotIdx, () => ({ message: msg, time }));
        } else {
          this.nextSlotIdx = this.push({
            id: `${event.eventId}-next`,
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

        // Suppress raw intermediate output only while a tool is actively
        // running. If the model streams plain narration between tool calls,
        // keep it visible so the user can follow the step-by-step flow.
        if (this.pendingTools.size > 0) {
          break;
        }

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
        this.finalizeNarration(event.agentId);

        // Discard any active stream from intermediate model text before this tool call.
        if (this.streamSlotIdx !== null) {
          this.evict(this.streamSlotIdx);
          this.streamSlotIdx = null;
          this.streamAgentId = null;
          this.streamRawBuffer = "";
        }

        // If a status message immediately preceded this tool call, absorb its
        // human-readable label into the bullet and evict the separate status row.
        let bulletLabel = describeToolCallActive(event.name, event.parameters);
        if (this.lastStatusSlotIdx !== null) {
          bulletLabel = this.lastStatusMessage;
          this.evict(this.lastStatusSlotIdx);
          this.lastStatusSlotIdx = null;
          this.lastStatusMessage = "";
        }

        const slotIdx = this.push({
          id: `${event.toolCallId}-bullet`,
          time,
          level: "bullet",
          message: bulletLabel,
          done: false,
        });
        this.pendingTools.set(event.toolCallId, {
          name: event.name,
          parameters: event.parameters,
          slotIdx,
          label: bulletLabel,
        });
        break;
      }

      case "tool_call_completed": {
        const pending = this.pendingTools.get(event.toolCallId);
        if (!pending) break;

        if (event.error) {
          this.update(pending.slotIdx, () => ({
            message: `${pending.label ?? describeToolCallActive(event.name, event.parameters)} — failed`,
            failed: true,
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
          // If we have a human-readable label, append just the count/stats suffix
          // from describeToolCallDone rather than its full path-based message.
          let doneMessage: string;
          if (pending.label) {
            const pathBased = describeToolCallDone(event.name, event.parameters, event.output);
            const dashIdx = pathBased.indexOf(" — ");
            const suffix = dashIdx !== -1 ? pathBased.slice(dashIdx) : "";
            doneMessage = `${pending.label}${suffix}`;
          } else {
            doneMessage = describeToolCallDone(event.name, event.parameters, event.output);
          }
          this.update(pending.slotIdx, () => ({
            message: doneMessage,
            done: true,
            ...(detail !== undefined ? { detail } : {}),
          }));
        }

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
        this.pendingDiffs.push({ filePath: event.filePath, diff: event.diff });
        break;

      case "run_completed": {
        if (this.streamSlotIdx !== null) {
          this.flushActiveStream(time, "response");
        } else {
          // Only fall back to finalOutput if no response was already streamed live
          const hasResponse = this.slots.some((s) => s.entry?.level === "response");
          if (!hasResponse) {
            const cleaned = cleanAgentResponse(event.finalOutput.trim());
            if (cleaned) {
              this.push({ id: `${event.eventId}-response`, time, level: "response", message: cleaned });
            }
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
    this.pendingDiffs = [];
    this.lastStatusSlotIdx = null;
    this.lastStatusMessage = "";
    this.nextSlotIdx = null;
  }

  getLog(): LogEntry[] {
    return this.slots.flatMap((slot) => (slot.entry ? [slot.entry] : []));
  }

  lookupPendingToolParams(toolCallId: string): Record<string, unknown> | undefined {
    return this.pendingTools.get(toolCallId)?.parameters;
  }
}

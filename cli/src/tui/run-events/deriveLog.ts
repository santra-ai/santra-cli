import type { DiffEntry, LogEntry } from "../types/index.ts";
import type { RunEvent } from "./types.ts";

// ─── Helpers (mirrors useAgent.ts helpers, kept local for purity) ─────────────

const MAX_BULLETS = 5;

function fmtTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function pathName(p: string): string {
  return p.split("/").pop() ?? p;
}

function stripLeakedJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of ["direct_answer", "answer", "content", "response", "text", "message", "output"]) {
        const val = parsed[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      return "";
    } catch {
      // Not valid JSON
    }
  }
  return trimmed;
}

function describeSectionStart(agentId: string): string {
  switch (agentId) {
    case "orchestrator": return "Planning task";
    case "file-picker":  return "Exploring codebase";
    case "reader":       return "Reading and analyzing files";
    case "executor":     return "Implementing changes";
    default:             return "Working";
  }
}

function describeToolCallActive(name: string, parameters: Record<string, unknown>): string {
  const p = parameters["path"] as string | undefined;
  const fileName = p ? pathName(p) : undefined;
  switch (name) {
    case "read_file":      return `Reading ${fileName ?? "file"}`;
    case "write_file":     return `Writing ${fileName ?? "file"}`;
    case "str_replace":    return `Editing ${fileName ?? "file"}`;
    case "list_directory": return `Listing ${p ?? "."}`;
    case "search_files": {
      const pat = parameters["pattern"] as string | undefined;
      return pat ? `Searching for pattern: ${pat}` : "Searching files";
    }
    case "search_text": {
      const q = parameters["query"] as string | undefined;
      return q ? `Searching: "${q.slice(0, 40)}"` : "Searching codebase";
    }
    case "get_cwd": return "Checking working directory";
    default:        return `Running ${name}`;
  }
}

function buildToolCallDetail(name: string, output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (name === "list_directory") {
      const entries = parsed["entries"] as Array<{ name: string; type: "file" | "directory" }> | undefined;
      if (!entries?.length) return undefined;
      const MAX_SHOW = 12;
      const dirs = entries.filter((e) => e.type === "directory");
      const files = entries.filter((e) => e.type !== "directory");
      const ordered = [...dirs, ...files].slice(0, MAX_SHOW);
      const lines = ordered.map((e) =>
        e.type === "directory" ? `  ▸ ${e.name}/` : `    ${e.name}`,
      );
      if (entries.length > MAX_SHOW) lines.push(`  … ${entries.length - MAX_SHOW} more`);
      return lines.join("\n");
    }
  } catch { /* fall through */ }
  return undefined;
}

function describeToolCallDone(
  name: string,
  parameters: Record<string, unknown>,
  output: string,
  error?: string,
): string {
  const p = parameters["path"] as string | undefined;
  const fileName = p ? pathName(p) : undefined;
  const q = parameters["query"] as string | undefined;
  const pat = parameters["pattern"] as string | undefined;

  if (error) {
    return `${describeToolCallActive(name, parameters)} — failed`;
  }

  const base =
    name === "read_file"      ? `Read ${fileName ?? "file"}` :
    name === "write_file"     ? `Wrote ${fileName ?? "file"}` :
    name === "str_replace"    ? `Edited ${fileName ?? "file"}` :
    name === "list_directory" ? `Listed ${p ?? "."}` :
    name === "search_files"   ? `Searched for: ${pat ?? "files"}` :
    name === "search_text"    ? `Searched: "${(q ?? "").slice(0, 40)}"` :
    name === "get_cwd"        ? "Got working directory" :
                                `Ran ${name}`;
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (name === "read_file") {
      const lines = parsed["lines"] as number | undefined;
      const truncated = parsed["truncated"] as boolean | undefined;
      return `${base} — ${lines ?? "?"} lines${truncated ? ", truncated" : ""}`;
    }
    if (name === "list_directory") {
      const entries = parsed["entries"] as unknown[] | undefined;
      return `${base} — ${entries?.length ?? "?"} entries`;
    }
    if (name === "search_files") {
      const count = parsed["count"] as number | undefined;
      return `${base} — ${count ?? "?"} files found`;
    }
    if (name === "search_text") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${base} — ${matches?.length ?? "?"} matches`;
    }
    if (name === "write_file") return `${base} — done`;
    if (name === "str_replace") {
      const changed = parsed["linesChanged"] as number | undefined;
      return `${base} — ${changed ?? "?"} lines changed`;
    }
    if (name === "get_cwd") return `${base}: ${parsed["cwd"] ?? ""}`;
  } catch { /* fall through */ }
  return base;
}

// ─── Mutable derivation state (local to one deriveLog call) ──────────────────

interface EntrySlot {
  entry: LogEntry | null; // null = evicted / removed
}

interface SectionState {
  slotIdx: number;        // index into slots[] for the section header
  bulletSlotIdxs: number[]; // indices of all bullet slots in this section
}

interface PendingTool {
  name: string;
  parameters: Record<string, unknown>;
  slotIdx: number;        // index into slots[] for the bullet entry
}

interface ThinkState {
  buffer: string;
  slotIdx: number;
}

// ─── Main derivation function ─────────────────────────────────────────────────

/**
 * Pure function: derives a rendered LogEntry[] from an append-only RunEvent[].
 *
 * No refs, no React, no side effects — safe to call multiple times with the
 * same event list and always produce the same output.
 */
export function deriveLog(events: RunEvent[]): LogEntry[] {
  const slots: EntrySlot[] = [];

  // Ongoing derivation state
  const sections = new Map<string, SectionState>(); // agentId → section state
  const thinkStates = new Map<string, ThinkState>(); // agentId → think buffer
  const pendingTools = new Map<string, PendingTool>(); // toolCallId → pending tool

  // Shared stream entry (single across all non-suppressed agents, same as original)
  let streamSlotIdx: number | null = null;
  let streamAgentId: string | null = null;

  // Diffs collected during run, rendered after run_completed
  const pendingDiffs: Array<{ filePath: string; diff: DiffEntry }> = [];

  function push(entry: Omit<LogEntry, never>): number {
    const idx = slots.length;
    slots.push({ entry });
    return idx;
  }

  function evict(idx: number): void {
    if (slots[idx]) slots[idx]!.entry = null;
  }

  function update(idx: number, updater: (e: LogEntry) => Partial<LogEntry>): void {
    const slot = slots[idx];
    if (!slot?.entry) return;
    slot.entry = { ...slot.entry, ...updater(slot.entry) };
  }

  // Finalize all pending state (called on run_completed / run_failed / run_interrupted)
  function finalizeAll(): void {
    // Finalize any open stream entry
    if (streamSlotIdx !== null) {
      update(streamSlotIdx, (e) => {
        const cleaned = stripLeakedJson(e.message);
        if (!cleaned) { evict(streamSlotIdx!); return {}; }
        return { level: "response", message: cleaned };
      });
      streamSlotIdx = null;
      streamAgentId = null;
    }
    // Finalize any open think entries
    for (const [agentId, state] of thinkStates) {
      const full = state.buffer.trim();
      if (full) {
        update(state.slotIdx, () => ({ message: full, finished: true }));
      } else {
        evict(state.slotIdx);
      }
      thinkStates.delete(agentId);
    }
    // Finalize any open sections
    for (const [agentId, section] of sections) {
      update(section.slotIdx, () => ({ finished: true }));
      sections.delete(agentId);
    }
    // Finalize any pending tool calls (mark done but without a result)
    for (const [, pending] of pendingTools) {
      update(pending.slotIdx, () => ({ done: true }));
    }
    pendingTools.clear();
  }

  for (const event of events) {
    const time = fmtTime(event.timestamp);

    switch (event.type) {

      case "run_started":
        break; // no UI entry needed

      case "user_message": {
        push({ id: `${event.eventId}-user`, time, level: "user", message: event.content });
        break;
      }

      case "agent_started": {
        const slotIdx = push({
          id: `${event.eventId}-section`,
          time,
          level: "section",
          message: describeSectionStart(event.agentId),
          finished: false,
        });
        sections.set(event.agentId, { slotIdx, bulletSlotIdxs: [] });
        // Reset any stale think state for this agent
        thinkStates.delete(event.agentId);
        break;
      }

      case "reasoning_delta": {
        const existing = thinkStates.get(event.agentId);
        if (existing) {
          const buffer = existing.buffer + event.delta;
          const snippet = buffer.length > 300 ? "…" + buffer.slice(-300) : buffer;
          update(existing.slotIdx, () => ({ message: snippet }));
          thinkStates.set(event.agentId, { ...existing, buffer });
        } else {
          const buffer = event.delta;
          const snippet = buffer.length > 300 ? "…" + buffer.slice(-300) : buffer;
          const slotIdx = push({ id: `${event.eventId}-think`, time, level: "think", message: snippet, finished: false });
          thinkStates.set(event.agentId, { buffer, slotIdx });
        }
        break;
      }

      case "text_delta": {
        // Suppress ALL text deltas while any swarm agent section is active.
        //
        // Swarm agents (orchestrator, file-picker, reader, executor) emit their raw
        // LLM stream as delta events. This stream contains planning commentary,
        // <tool_call> / <tool_result> XML tags, and other noise — not the clean final
        // response. The clean response arrives via run_completed.finalOutput instead.
        //
        // The ONLY time we want to show streaming text is when no agent section is
        // active, i.e. we are in the direct BaseAgent path (simple/direct questions
        // bypassing the swarm entirely). In that case sections.size === 0 throughout.
        if (sections.size > 0) break;

        // Safety: also suppress named swarm agents even if no section is tracked
        if (
          event.agentId === "orchestrator" ||
          event.agentId === "file-picker" ||
          event.agentId === "reader" ||
          event.agentId === "executor"
        ) break;

        if (streamSlotIdx !== null) {
          update(streamSlotIdx, (e) => ({ message: e.message + event.content }));
        } else {
          streamSlotIdx = push({ id: `${event.agentId}-stream`, time, level: "stream", message: event.content });
          streamAgentId = event.agentId;
        }
        break;
      }

      case "tool_call_started": {
        const section = sections.get(event.agentId);
        const slotIdx = push({
          id: `${event.toolCallId}-bullet`,
          time,
          level: "bullet",
          message: describeToolCallActive(event.name, event.parameters),
          done: false,
        });
        if (section) {
          section.bulletSlotIdxs.push(slotIdx);
        }
        pendingTools.set(event.toolCallId, {
          name: event.name,
          parameters: event.parameters,
          slotIdx,
        });
        break;
      }

      case "tool_call_completed": {
        const pending = pendingTools.get(event.toolCallId);
        if (pending) {
          if (event.error) {
            update(pending.slotIdx, () => ({
              message: `${describeToolCallActive(event.name, event.parameters)} — failed`,
              done: true,
            }));
            push({ id: `${event.toolCallId}-error`, time, level: "error", message: event.error });
          } else {
            const doneMsg = describeToolCallDone(event.name, event.parameters, event.output);
            const detail = buildToolCallDetail(event.name, event.output);
            update(pending.slotIdx, () => ({
              message: doneMsg,
              done: true,
              ...(detail !== undefined ? { detail } : {}),
            }));
          }
          pendingTools.delete(event.toolCallId);
        }
        break;
      }

      case "agent_completed": {
        // Finalize think entry for this agent
        const think = thinkStates.get(event.agentId);
        if (think) {
          const full = think.buffer.trim();
          if (full) {
            update(think.slotIdx, () => ({ message: full, finished: true }));
          } else {
            evict(think.slotIdx);
          }
          thinkStates.delete(event.agentId);
        }

        // Mark section header as done
        const section = sections.get(event.agentId);
        if (section) {
          update(section.slotIdx, () => ({ finished: true }));
          sections.delete(event.agentId);
        }

        // Suppress orchestrator stream entry (raw JSON output)
        if (event.agentId === "orchestrator" && streamSlotIdx !== null && streamAgentId === "orchestrator") {
          evict(streamSlotIdx);
          streamSlotIdx = null;
          streamAgentId = null;
        }
        break;
      }

      case "diff_collected": {
        pendingDiffs.push({ filePath: event.filePath, diff: event.diff });
        break;
      }

      case "run_completed": {
        // Finalize stream entry → response
        if (streamSlotIdx !== null) {
          const slotIdx = streamSlotIdx;
          update(slotIdx, (e) => {
            const cleaned = stripLeakedJson(e.message);
            if (!cleaned) { evict(slotIdx); return {}; }
            return { level: "response", message: cleaned };
          });
          streamSlotIdx = null;
          streamAgentId = null;
        } else {
          const cleaned = stripLeakedJson(event.finalOutput.trim());
          if (cleaned) {
            push({ id: `${event.eventId}-response`, time, level: "response", message: cleaned });
          }
        }
        // Finalize remaining open state
        finalizeAll();
        // Render diffs after response (always visible at bottom)
        for (const { filePath, diff } of pendingDiffs) {
          push({ id: `${event.eventId}-diff-${filePath}`, time, level: "diff", message: filePath, diff });
        }
        pendingDiffs.length = 0;
        break;
      }

      case "run_failed": {
        finalizeAll();
        push({ id: `${event.eventId}-error`, time, level: "error", message: event.message });
        break;
      }

      case "run_interrupted": {
        finalizeAll();
        break;
      }
    }
  }

  // ─── Apply MAX_BULLETS eviction per section ─────────────────────────────────
  // For each section, only the last MAX_BULLETS bullet slots survive.
  // We need to re-scan slots to find all section→bullet relationships.
  // We do this by re-deriving from the sections that recorded bulletSlotIdxs.
  // Since sections is cleared as agents complete, we need a second pass over
  // events to collect all bullet slot indices per section group.
  const evictedBulletSlots = new Set<number>();
  const sectionBulletGroups: number[][] = [];

  // Rebuild section bullet groups from slots (find all bullets belonging to each section)
  // We detect sections by looking at consecutive bullet slots after a section header.
  // Simpler approach: during derivation we stored them. We need to gather them from
  // the now-cleared sections map. Instead, rebuild from event scan:
  {
    let currentGroup: number[] | null = null;
    for (const event of events) {
      if (event.type === "agent_started") {
        currentGroup = [];
        sectionBulletGroups.push(currentGroup);
      } else if (event.type === "tool_call_started" && currentGroup !== null) {
        // Find the slot idx for this toolCallId
        const slot = slots.findIndex((s) => s.entry?.id === `${event.toolCallId}-bullet`);
        if (slot !== -1) currentGroup.push(slot);
      } else if (event.type === "agent_completed") {
        currentGroup = null;
      }
    }
  }

  for (const group of sectionBulletGroups) {
    if (group.length > MAX_BULLETS) {
      const toEvict = group.slice(0, group.length - MAX_BULLETS);
      for (const idx of toEvict) evictedBulletSlots.add(idx);
    }
  }

  // Build final output, skipping null and evicted entries
  return slots
    .filter((slot, idx) => slot.entry !== null && !evictedBulletSlots.has(idx))
    .map((slot) => slot.entry!);
}

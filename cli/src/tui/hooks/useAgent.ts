import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId, AgentPhase, AvailableModelId, RunState, ToolCallRequest, ToolCallResult } from "@santra/shared";
import { Client } from "../../client.ts";
import {
  createChatId,
  listSavedChats,
  loadRunState,
  saveRunState,
  type StoredChatSummary,
} from "../../utils/run-state-storage.ts";
import { sessionLogger } from "../../utils/session-logger.ts";
import type { AgentStats, DiffEntry, FileEntry, LogEntry, Task } from "../types/index.ts";
import type { FileChangeFeedback } from "@santra/agent-runtime";
import { buildDiff } from "../../utils/diff.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeStamp(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function makeId(): string {
  return Math.random().toString(36).substring(2, 8);
}

function pathDepth(p: string): number {
  return p.replace(/^\//, "").split("/").length - 1;
}

function pathName(p: string): string {
  return p.split("/").pop() ?? p;
}

function upsertFile(
  prev: FileEntry[],
  filePath: string,
  status: FileEntry["status"],
  type: FileEntry["type"],
): FileEntry[] {
  const existing = prev.find((f) => f.path === filePath);
  if (existing) {
    const rank = { none: 0, read: 1, modified: 2, new: 2 };
    if (rank[status] <= rank[existing.status]) return prev;
    return prev.map((f) => (f.path === filePath ? { ...f, status } : f));
  }
  return [
    ...prev,
    { name: pathName(filePath), path: filePath, status, type, depth: pathDepth(filePath) },
  ];
}

const MAX_BULLETS = 3; // max visible bullet rows per section

/**
 * If the agent accidentally emitted a raw JSON object as its final text,
 * try to extract the meaningful content from it; otherwise return the text as-is.
 */
function stripLeakedJson(text: string): string {
  const trimmed = text.trim();
  // Detect if the entire output looks like a JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      // Try common keys that contain readable content
      for (const key of ["direct_answer", "answer", "content", "response", "text", "message", "output"]) {
        const val = parsed[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      // No useful key found — don't show raw JSON to the user
      return "";
    } catch {
      // Not valid JSON — show as-is
    }
  }
  return trimmed;
}

/** Section header label per agent */
function describeSectionStart(agentId: AgentId): string {
  switch (agentId) {
    case "orchestrator": return "Planning task";
    case "file-picker":  return "Exploring codebase";
    case "reader":       return "Reading and analyzing files";
    case "executor":     return "Implementing changes";
    default:             return "Working";
  }
}

/** Present-tense tool call description */
function describeToolCallActive(call: ToolCallRequest): string {
  const p = call.parameters["path"] as string | undefined;
  const name = p ? pathName(p) : undefined;
  switch (call.name) {
    case "read_file":      return `Reading ${name ?? "file"}`;
    case "write_file":     return `Writing ${name ?? "file"}`;
    case "str_replace":    return `Editing ${name ?? "file"}`;
    case "list_directory": return `Listing ${p ?? "."}`;
    case "search_files": {
      const pat = call.parameters["pattern"] as string | undefined;
      return pat ? `Searching for pattern: ${pat}` : "Searching files";
    }
    case "search_text": {
      const q = call.parameters["query"] as string | undefined;
      return q ? `Searching: "${q.slice(0, 40)}"` : "Searching codebase";
    }
    case "get_cwd": return "Checking working directory";
    default:        return `Running ${call.name}`;
  }
}

/**
 * Build a multi-line detail string shown below the bullet row for certain tools.
 * Returns undefined for tools where no extra detail is useful.
 */
function buildToolCallDetail(call: ToolCallRequest, result: ToolCallResult): string | undefined {
  if (result.error) return undefined;
  try {
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    if (call.name === "list_directory") {
      const entries = parsed["entries"] as Array<{ name: string; type: "file" | "directory" }> | undefined;
      if (!entries?.length) return undefined;
      const MAX_SHOW = 12;
      const dirs = entries.filter((e) => e.type === "directory");
      const files = entries.filter((e) => e.type !== "directory");
      // Show dirs first, then files
      const ordered = [...dirs, ...files].slice(0, MAX_SHOW);
      const lines = ordered.map((e) =>
        e.type === "directory" ? `  ▸ ${e.name}/` : `    ${e.name}`,
      );
      if (entries.length > MAX_SHOW) {
        lines.push(`  … ${entries.length - MAX_SHOW} more`);
      }
      return lines.join("\n");
    }
  } catch { /* fall through */ }
  return undefined;
}

/** Past-tense with result details */
function describeToolCallDone(call: ToolCallRequest, result: ToolCallResult): string {
  const p = call.parameters["path"] as string | undefined;
  const name = p ? pathName(p) : undefined;
  const q = call.parameters["query"] as string | undefined;
  const pat = call.parameters["pattern"] as string | undefined;
  const base =
    call.name === "read_file"      ? `Read ${name ?? "file"}` :
    call.name === "write_file"     ? `Wrote ${name ?? "file"}` :
    call.name === "str_replace"    ? `Edited ${name ?? "file"}` :
    call.name === "list_directory" ? `Listed ${p ?? "."}` :
    call.name === "search_files"   ? `Searched for: ${pat ?? "files"}` :
    call.name === "search_text"    ? `Searched: "${(q ?? "").slice(0, 40)}"` :
    call.name === "get_cwd"        ? "Got working directory" :
                                     `Ran ${call.name}`;
  try {
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    if (result.name === "read_file") {
      const lines = parsed["lines"] as number | undefined;
      const truncated = parsed["truncated"] as boolean | undefined;
      return `${base} — ${lines ?? "?"} lines${truncated ? ", truncated" : ""}`;
    }
    if (result.name === "list_directory") {
      const entries = parsed["entries"] as unknown[] | undefined;
      return `${base} — ${entries?.length ?? "?"} entries`;
    }
    if (result.name === "search_files") {
      const count = parsed["count"] as number | undefined;
      return `${base} — ${count ?? "?"} files found`;
    }
    if (result.name === "search_text") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${base} — ${matches?.length ?? "?"} matches`;
    }
    if (result.name === "write_file") return `${base} — done`;
    if (result.name === "str_replace") {
      const changed = parsed["linesChanged"] as number | undefined;
      return `${base} — ${changed ?? "?"} lines changed`;
    }
    if (result.name === "get_cwd") return `${base}: ${parsed["cwd"] ?? ""}`;
  } catch { /* fall through */ }
  return base;
}

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_TASKS: Task[] = [
  { id: "orchestrator", label: "Plan task",       status: "pending" },
  { id: "file-picker",  label: "Read files",      status: "pending" },
  { id: "reader",       label: "Analyze code",    status: "pending" },
  { id: "executor",     label: "Execute changes", status: "pending" },
];

function makeInitialStats(): AgentStats {
  const model = (process.env["NVIDIA_MODEL"] ?? "meta/llama-3.1-8b-instruct") as AvailableModelId;
  return { model, tokens: 0, steps: 0, totalSteps: 20, elapsed: 0, toolCalls: 0 };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAgentReturn {
  tasks: Task[];
  files: FileEntry[];
  log: LogEntry[];
  stats: AgentStats;
  done: boolean;
  busy: boolean;
  chatId: string;
  savedChats: StoredChatSummary[];
  submit: (prompt: string) => Promise<void>;
  resume: (chatId?: string) => void;
  clearLog: () => void;
  handleCommand: (cmd: string, arg?: string) => void;
}

export default function useAgent(): UseAgentReturn {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<AgentStats>(makeInitialStats);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(() => createChatId());
  const [savedChats, setSavedChats] = useState<StoredChatSummary[]>(() => listSavedChats());

  const clientRef = useRef(new Client());
  const runStateRef = useRef<RunState | undefined>(undefined);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  // Per-run tracking refs
  const streamEntryIdRef = useRef<string | null>(null);
  const sectionEntryIdRef = useRef<string | null>(null);
  const sectionBulletIdsRef = useRef<string[]>([]); // IDs of bullets in current section
  const thinkingBuffersRef = useRef<Record<string, string>>({});
  const thinkEntryIdRef = useRef<string | null>(null); // live think entry per agent
  const pendingCallsRef = useRef<Record<string, { call: ToolCallRequest; bulletId: string }>>({});
  const pendingDiffsRef = useRef<Array<{ filePath: string; diff: DiffEntry }>>([]); // diffs collected mid-run

  // ─── Log helpers ──────────────────────────────────────────────────────────

  const pushLog = useCallback((entry: Omit<LogEntry, "id" | "time">): string => {
    const id = makeId();
    setLog((prev) => [...prev, { ...entry, id, time: timeStamp() }]);
    return id;
  }, []);

  const updateLog = useCallback((id: string, updater: (e: LogEntry) => Partial<LogEntry>) => {
    setLog((prev) => prev.map((e) => e.id === id ? { ...e, ...updater(e) } : e));
  }, []);

  const removeLog = useCallback((id: string) => {
    setLog((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const setTaskStatus = useCallback((id: string, status: Task["status"]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }, []);

  const addFile = useCallback((filePath: string, status: FileEntry["status"], type: FileEntry["type"]) => {
    setFiles((prev) => upsertFile(prev, filePath, status, type));
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== undefined) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = undefined;
    }
  }, []);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      setStats((prev) => ({ ...prev, elapsed: prev.elapsed + 1 }));
    }, 1000);
  }, [stopElapsedTimer]);

  useEffect(() => () => stopElapsedTimer(), [stopElapsedTimer]);

  // ─── Phase handler ─────────────────────────────────────────────────────────

  const onPhase = useCallback((phase: AgentPhase) => {
    switch (phase.type) {

      case "agent_start": {
        setTaskStatus(phase.agentId, "active");
        thinkingBuffersRef.current[phase.agentId] = "";
        thinkEntryIdRef.current = null;
        sectionEntryIdRef.current = null;
        sectionBulletIdsRef.current = [];

        const id = pushLog({ level: "section", message: describeSectionStart(phase.agentId), finished: false });
        sectionEntryIdRef.current = id;
        break;
      }

      case "agent_done": {
        const thinking = thinkingBuffersRef.current[phase.agentId];
        // Finalize the live think entry (expand to full content or remove if empty)
        if (thinkEntryIdRef.current) {
          if (thinking?.trim()) {
            updateLog(thinkEntryIdRef.current, () => ({ message: thinking.trim(), finished: true }));
          } else {
            removeLog(thinkEntryIdRef.current);
          }
          thinkEntryIdRef.current = null;
        }
        thinkingBuffersRef.current[phase.agentId] = "";
        setTaskStatus(phase.agentId, "done");

        if (sectionEntryIdRef.current) {
          updateLog(sectionEntryIdRef.current, () => ({ finished: true }));
        }

        // Discard orchestrator stream entry (it's raw JSON, not useful to display)
        if (phase.agentId === "orchestrator") {
          if (streamEntryIdRef.current) {
            removeLog(streamEntryIdRef.current);
            streamEntryIdRef.current = null;
          }
        }

        sectionEntryIdRef.current = null;
        sectionBulletIdsRef.current = [];
        sessionLogger.log(chatId, `AGENT[${phase.agentId}]`, phase.output);
        break;
      }

      case "thinking": {
        thinkingBuffersRef.current[phase.agentId] =
          (thinkingBuffersRef.current[phase.agentId] ?? "") + phase.delta;
        // Show the last 300 chars of thinking in real time (to keep viewport bounded)
        const full = thinkingBuffersRef.current[phase.agentId]!;
        const snippet = full.length > 300 ? "…" + full.slice(-300) : full;
        if (thinkEntryIdRef.current) {
          updateLog(thinkEntryIdRef.current, () => ({ message: snippet }));
        } else {
          const id = pushLog({ level: "think", message: snippet });
          thinkEntryIdRef.current = id;
        }
        break;
      }

      case "delta": {
        const agentId = (phase as { agentId?: string }).agentId;
        // Orchestrator outputs raw JSON — hide it; file-picker streaming is shown via tool bullets
        if (agentId === "orchestrator" || agentId === "file-picker") break;

        if (streamEntryIdRef.current) {
          updateLog(streamEntryIdRef.current, (e) => ({ message: e.message + phase.content }));
        } else {
          const id = pushLog({ level: "stream", message: phase.content });
          streamEntryIdRef.current = id;
        }
        break;
      }

      case "tool_call": {
        const call = phase.call;

        // Push new bullet; if we already have MAX_BULLETS, remove the oldest
        if (sectionBulletIdsRef.current.length >= MAX_BULLETS) {
          const oldest = sectionBulletIdsRef.current.shift()!;
          removeLog(oldest);
        }
        const bulletId = pushLog({ level: "bullet", message: describeToolCallActive(call), done: false });
        sectionBulletIdsRef.current.push(bulletId);
        pendingCallsRef.current[call.id] = { call, bulletId };

        const callPath = call.parameters["path"] as string | undefined;
        if (callPath) {
          if (call.name === "read_file")          addFile(callPath, "read",     "file");
          else if (call.name === "write_file")     addFile(callPath, "new",      "file");
          else if (call.name === "str_replace")    addFile(callPath, "modified", "file");
          else if (call.name === "list_directory") addFile(callPath, "none",     "dir");
        }

        setStats((prev) => ({
          ...prev,
          steps: prev.steps + 1,
          toolCalls: prev.toolCalls + 1,
          tokens: prev.tokens + 200,
        }));

        sessionLogger.log(chatId, `TOOL_CALL[${call.name}]`, JSON.stringify(call.parameters, null, 2));
        break;
      }

      case "tool_result": {
        const result = phase.result;
        const pending = pendingCallsRef.current[result.id];

        if (result.error) {
          if (pending) {
            updateLog(pending.bulletId, () => ({ message: `${describeToolCallActive(pending.call)} — failed`, done: true }));
          }
          pushLog({ level: "error", message: result.error });
        } else if (pending) {
          const doneMsg = describeToolCallDone(pending.call, result);
          const detail = buildToolCallDetail(pending.call, result);
          updateLog(pending.bulletId, () => ({
            message: doneMsg,
            done: true,
            ...(detail !== undefined ? { detail } : {}),
          }));
          delete pendingCallsRef.current[result.id];
        }

        sessionLogger.log(chatId, `TOOL_RESULT[${result.name}]`, result.error ? `ERROR: ${result.error}` : result.output.slice(0, 200));
        break;
      }

      case "done": {
        if (streamEntryIdRef.current) {
          // Streaming entry: finalize it, but if it looks like raw JSON strip it
          const current = streamEntryIdRef.current;
          updateLog(current, (e) => {
            const cleaned = stripLeakedJson(e.message);
            return { level: "response", message: cleaned };
          });
          streamEntryIdRef.current = null;
        } else {
          const cleaned = stripLeakedJson(phase.finalOutput.trim());
          if (cleaned) pushLog({ level: "response", message: cleaned });
        }

        // Push all collected diffs AFTER the response so they appear at the bottom (always visible)
        for (const { filePath, diff } of pendingDiffsRef.current) {
          pushLog({ level: "diff", message: filePath, diff });
        }
        pendingDiffsRef.current = [];

        sectionEntryIdRef.current = null;
        break;
      }

      case "error": {
        setTasks((prev) => prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)));
        pushLog({ level: "error", message: phase.message });
        sessionLogger.log(chatId, "ERROR", phase.message);
        break;
      }
    }
  }, [chatId, pushLog, updateLog, removeLog, setTaskStatus, addFile]);

  // ─── File change: auto-accept, just show diff ─────────────────────────────

  const onFileChangeReview = useCallback(
    (callId: string, filePath: string, oldStr: string, newStr: string): Promise<FileChangeFeedback> => {
      // Collect diff — will be shown AFTER the response entry so it's always visible at the bottom
      const diff = buildDiff(filePath, oldStr, newStr, 3);
      pendingDiffsRef.current.push({ filePath, diff });
      // Auto-accept — no prompt, keep running
      return Promise.resolve({ decision: "keep" as const });
    },
    [],
  );

  // ─── submit ───────────────────────────────────────────────────────────────

  const submit = useCallback(async (prompt: string) => {
    setBusy(true);
    setDone(false);

    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    // NOTE: do NOT clear files — they accumulate across requests
    setStats(makeInitialStats());
    thinkingBuffersRef.current = {};
    pendingCallsRef.current = {};
    pendingDiffsRef.current = [];
    streamEntryIdRef.current = null;
    sectionEntryIdRef.current = null;
    sectionBulletIdsRef.current = [];
    thinkEntryIdRef.current = null;

    pushLog({ level: "user", message: prompt });
    sessionLogger.log(chatId, "USER", prompt);
    startElapsedTimer();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let doneEmitted = false;
      const wrappedOnPhase = (phase: Parameters<typeof onPhase>[0]) => {
        if (phase.type === "done") doneEmitted = true;
        onPhase(phase);
      };

      const state = await clientRef.current.run({
        prompt,
        previousState: runStateRef.current,
        onPhase: wrappedOnPhase,
        abortSignal: controller.signal,
        onFileChangeReview,
      });

      runStateRef.current = state;
      saveRunState({ chatId, state });
      setSavedChats(listSavedChats());

      if (state.output.type === "error") {
        pushLog({ level: "error", message: state.output.message });
        sessionLogger.log(chatId, "ERROR", state.output.message);
      } else if (state.output.type === "text" && !doneEmitted) {
        if (streamEntryIdRef.current) {
          updateLog(streamEntryIdRef.current, () => ({ level: "response" }));
          streamEntryIdRef.current = null;
        } else {
          const content = stripLeakedJson(state.output.content.trim());
          if (content) {
            pushLog({ level: "response", message: content });
            sessionLogger.log(chatId, "RESPONSE", content);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTasks((prev) => prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)));
      pushLog({ level: "error", message: msg });
      sessionLogger.log(chatId, "ERROR", msg);
    } finally {
      abortControllerRef.current = undefined;
      stopElapsedTimer();
      setBusy(false);
      setDone(true);
      streamEntryIdRef.current = null;
    }
  }, [chatId, onFileChangeReview, onPhase, pushLog, updateLog, startElapsedTimer, stopElapsedTimer]);

  // ─── resume ───────────────────────────────────────────────────────────────

  const resume = useCallback((resumeChatId?: string) => {
    let targetId = resumeChatId;
    if (!targetId) {
      const chats = listSavedChats();
      if (chats.length === 0) {
        pushLog({ level: "error", message: "No saved sessions found." });
        return;
      }
      targetId = chats[0]!.chatId;
    }
    const state = loadRunState(targetId);
    if (!state) {
      pushLog({ level: "error", message: `Could not load session: ${targetId}` });
      return;
    }
    runStateRef.current = state;
    setChatId(targetId);
    setFiles([]);
    setStats(makeInitialStats());
    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    setSavedChats(listSavedChats());
    pushLog({ level: "ok", message: `Resumed session: ${targetId}` });
  }, [pushLog]);

  // ─── clearLog ─────────────────────────────────────────────────────────────

  const clearLog = useCallback(() => {
    setLog([]);
    setFiles([]);
  }, []);

  // ─── handleCommand ────────────────────────────────────────────────────────

  const handleCommand = useCallback((cmd: string, arg?: string) => {
    const command = cmd.replace(/^\//, "").toLowerCase();
    switch (command) {
      case "clear":
        clearLog();
        break;
      case "resume": {
        const targetId = arg?.trim() || undefined;
        resume(targetId);
        break;
      }
      case "stop":
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          pushLog({ level: "info", message: "Agent stopped." });
        } else {
          pushLog({ level: "info", message: "No agent is running." });
        }
        break;
      case "model":
        pushLog({ level: "info", message: `Model: ${stats.model}` });
        break;
      case "help":
        pushLog({ level: "info", message: "/clear  /resume [id]  /stop  /model  /help" });
        break;
      default:
        pushLog({ level: "error", message: `Unknown command: /${command}` });
    }
  }, [clearLog, pushLog, resume, stats.model]);

  return {
    tasks,
    files,
    log,
    stats,
    done,
    busy,
    chatId,
    savedChats,
    submit,
    resume,
    clearLog,
    handleCommand,
  };
}

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
import type { RunEvent } from "../run-events/types.ts";
import { deriveLog } from "../run-events/deriveLog.ts";

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

/**
 * If the agent accidentally emitted a raw JSON object as its final text,
 * try to extract the meaningful content from it; otherwise return the text as-is.
 */
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
      // Not valid JSON — show as-is
    }
  }
  return trimmed;
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
  abortCurrentRun: (source: "slash" | "keyboard") => void;
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

  // ─── Authoritative append-only run event log ───────────────────────────────
  // These replace the 7 mutable tracking refs (streamEntryIdRef, sectionEntryIdRef,
  // sectionBulletIdsRef, thinkingBuffersRef, thinkEntryIdRef, pendingCallsRef,
  // pendingDiffsRef). The UI log is always derived from these events.
  const runEventsRef = useRef<RunEvent[]>([]);
  const runIdRef = useRef<string>("");
  const seqRef = useRef<number>(0);
  const abortSourceRef = useRef<"slash" | "keyboard">("slash");
  // Tracks which agent is currently active (tool_call/tool_result lack agentId in AgentPhase)
  const activeAgentIdRef = useRef<string>("unknown");

  // ─── Event append helper ───────────────────────────────────────────────────

  const appendEvent = useCallback((event: RunEvent) => {
    runEventsRef.current.push(event);
    setLog(deriveLog(runEventsRef.current));
  }, []);

  function makeEvent<T extends Omit<RunEvent, "eventId" | "seq" | "runId" | "timestamp">>(
    fields: T,
  ): T & { eventId: string; seq: number; runId: string; timestamp: number } {
    return {
      ...fields,
      eventId: makeId(),
      seq: seqRef.current++,
      runId: runIdRef.current,
      timestamp: Date.now(),
    } as T & { eventId: string; seq: number; runId: string; timestamp: number };
  }

  // ─── Side-effect helpers (task/file state, unchanged) ─────────────────────

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
  // Translates AgentPhase → RunEvent (for authoritative log) and keeps all
  // side-effect state (tasks, files, stats, session logger) up to date.

  const onPhase = useCallback((phase: AgentPhase) => {
    switch (phase.type) {

      case "agent_start": {
        setTaskStatus(phase.agentId, "active");
        activeAgentIdRef.current = phase.agentId;
        appendEvent(makeEvent({ type: "agent_started", agentId: phase.agentId, task: phase.task }));
        break;
      }

      case "agent_done": {
        setTaskStatus(phase.agentId, "done");
        appendEvent(makeEvent({ type: "agent_completed", agentId: phase.agentId, output: phase.output }));
        sessionLogger.log(chatId, `AGENT[${phase.agentId}]`, phase.output);
        activeAgentIdRef.current = "unknown";
        break;
      }

      case "thinking": {
        appendEvent(makeEvent({ type: "reasoning_delta", agentId: phase.agentId, delta: phase.delta }));
        break;
      }

      case "delta": {
        const agentId = (phase as { agentId?: string }).agentId ?? "unknown";
        appendEvent(makeEvent({ type: "text_delta", agentId, content: phase.content }));
        break;
      }

      case "tool_call": {
        const call: ToolCallRequest = phase.call;
        appendEvent(makeEvent({
          type: "tool_call_started",
          toolCallId: call.id,
          agentId: activeAgentIdRef.current,
          name: call.name,
          parameters: call.parameters,
        }));

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
        const result: ToolCallResult = phase.result;
        // Look up original parameters from the already-appended tool_call_started event
        const startEvt = runEventsRef.current.findLast(
          (e): e is Extract<RunEvent, { type: "tool_call_started" }> =>
            e.type === "tool_call_started" && e.toolCallId === result.id,
        );
        appendEvent(makeEvent({
          type: "tool_call_completed",
          toolCallId: result.id,
          agentId: activeAgentIdRef.current,
          name: result.name,
          parameters: startEvt?.parameters ?? {},
          output: result.output,
          ...(result.error ? { error: result.error } : {}),
        }));
        sessionLogger.log(chatId, `TOOL_RESULT[${result.name}]`, result.error ? `ERROR: ${result.error}` : result.output.slice(0, 200));
        break;
      }

      case "done": {
        appendEvent(makeEvent({ type: "run_completed", finalOutput: phase.finalOutput }));
        break;
      }

      case "error": {
        setTasks((prev) => prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)));
        appendEvent(makeEvent({ type: "run_failed", message: phase.message }));
        sessionLogger.log(chatId, "ERROR", phase.message);
        break;
      }
    }
  }, [chatId, appendEvent, setTaskStatus, addFile]);

  // ─── File change: auto-accept, collect diff as event ──────────────────────

  const onFileChangeReview = useCallback(
    (callId: string, filePath: string, oldStr: string, newStr: string): Promise<FileChangeFeedback> => {
      const diff: DiffEntry = buildDiff(filePath, oldStr, newStr, 3);
      appendEvent(makeEvent({ type: "diff_collected", filePath, diff }));
      // Auto-accept — no prompt, keep running
      return Promise.resolve({ decision: "keep" as const });
    },
    [appendEvent],
  );

  // ─── submit ───────────────────────────────────────────────────────────────

  const submit = useCallback(async (prompt: string) => {
    setBusy(true);
    setDone(false);

    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    setStats(makeInitialStats());

    // Reset authoritative event log for this new run
    runEventsRef.current = [];
    runIdRef.current = makeId();
    seqRef.current = 0;
    abortSourceRef.current = "slash";

    // Bootstrap: append user message and run_started immediately
    appendEvent(makeEvent({ type: "user_message", content: prompt }));
    appendEvent(makeEvent({ type: "run_started" }));

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
        // Only emit run_failed if it wasn't already emitted via onPhase("error")
        if (!controller.signal.aborted) {
          appendEvent(makeEvent({ type: "run_failed", message: state.output.message }));
          sessionLogger.log(chatId, "ERROR", state.output.message);
        }
      } else if (state.output.type === "text" && !doneEmitted) {
        // Single-agent path: no "done" phase was emitted, finalize here
        const content = stripLeakedJson(state.output.content.trim());
        if (content) {
          appendEvent(makeEvent({ type: "run_completed", finalOutput: content }));
          sessionLogger.log(chatId, "RESPONSE", content);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!controller.signal.aborted) {
        setTasks((prev) => prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)));
        appendEvent(makeEvent({ type: "run_failed", message: msg }));
        sessionLogger.log(chatId, "ERROR", msg);
      }
    } finally {
      // If aborted, emit run_interrupted so deriveLog finalizes all pending entries
      if (controller.signal.aborted) {
        appendEvent(makeEvent({ type: "run_interrupted", source: abortSourceRef.current }));
      }
      abortControllerRef.current = undefined;
      stopElapsedTimer();
      setBusy(false);
      setDone(true);
    }
  }, [chatId, onFileChangeReview, onPhase, appendEvent, startElapsedTimer, stopElapsedTimer]);

  // ─── resume ───────────────────────────────────────────────────────────────

  const resume = useCallback((resumeChatId?: string) => {
    let targetId = resumeChatId;
    if (!targetId) {
      const chats = listSavedChats();
      if (chats.length === 0) {
        appendEvent(makeEvent({ type: "run_failed", message: "No saved sessions found." }));
        return;
      }
      targetId = chats[0]!.chatId;
    }
    const state = loadRunState(targetId);
    if (!state) {
      appendEvent(makeEvent({ type: "run_failed", message: `Could not load session: ${targetId}` }));
      return;
    }
    runStateRef.current = state;
    setChatId(targetId);
    setFiles([]);
    setStats(makeInitialStats());
    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    setSavedChats(listSavedChats());
    // Show a plain info message (not via event log since we don't have a run context)
    setLog((prev) => [...prev, {
      id: makeId(),
      time: timeStamp(),
      level: "ok",
      message: `Resumed session: ${targetId}`,
    }]);
  }, [appendEvent]);

  // ─── clearLog ─────────────────────────────────────────────────────────────

  const clearLog = useCallback(() => {
    setLog([]);
    setFiles([]);
    runEventsRef.current = [];
  }, []);

  // ─── abortCurrentRun ──────────────────────────────────────────────────────

  const abortCurrentRun = useCallback((source: "slash" | "keyboard") => {
    if (!abortControllerRef.current) return;
    abortSourceRef.current = source;
    abortControllerRef.current.abort();
    // run_interrupted is emitted in submit()'s finally block once abort propagates
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
          abortCurrentRun("slash");
          setLog((prev) => [...prev, { id: makeId(), time: timeStamp(), level: "info", message: "Agent stopped." }]);
        } else {
          setLog((prev) => [...prev, { id: makeId(), time: timeStamp(), level: "info", message: "No agent is running." }]);
        }
        break;
      case "model":
        setLog((prev) => [...prev, { id: makeId(), time: timeStamp(), level: "info", message: `Model: ${stats.model}` }]);
        break;
      case "help":
        setLog((prev) => [...prev, { id: makeId(), time: timeStamp(), level: "info", message: "/clear  /resume [id]  /stop  /model  /help" }]);
        break;
      default:
        setLog((prev) => [...prev, { id: makeId(), time: timeStamp(), level: "error", message: `Unknown command: /${command}` }]);
    }
  }, [clearLog, resume, abortCurrentRun, stats.model]);

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
    abortCurrentRun,
  };
}

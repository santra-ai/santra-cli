import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentPhase, AvailableModelId, RunState, ToolCallRequest, ToolCallResult } from "@santra/shared";
import { Client } from "../../client.ts";
import {
  createChatId,
  listSavedChats,
  loadRunState,
  saveRunState,
  type StoredChatSummary,
} from "../../utils/run-state-storage.ts";
import { sessionLogger } from "../../utils/session-logger.ts";
import type { AgentStats, DiffEntry, FileEntry, LogEntry, ShellState, Task } from "../types/index.ts";

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
    // Only upgrade status (none < read < modified/new)
    const rank = { none: 0, read: 1, modified: 2, new: 2 };
    if (rank[status] <= rank[existing.status]) return prev;
    return prev.map((f) => (f.path === filePath ? { ...f, status } : f));
  }
  return [
    ...prev,
    {
      name: pathName(filePath),
      path: filePath,
      status,
      type,
      depth: pathDepth(filePath),
    },
  ];
}

function formatToolCall(call: ToolCallRequest): string {
  const params = call.parameters;
  const parts = Object.entries(params)
    .slice(0, 2) // show at most 2 key=val pairs to keep it concise
    .map(([k, v]) => {
      const val = typeof v === "string" ? `"${v.slice(0, 40)}"` : String(v);
      return `${k}=${val}`;
    });
  return `${call.name}(${parts.join(", ")})`;
}

function summarizeToolResult(result: ToolCallResult): string {
  try {
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    if (result.name === "read_file") {
      const lines = parsed["lines"] as number | undefined;
      const truncated = parsed["truncated"] as boolean | undefined;
      return `read ${lines ?? "?"} lines${truncated ? " (truncated)" : ""}`;
    }
    if (result.name === "list_directory") {
      const entries = parsed["entries"] as unknown[] | undefined;
      return `listed ${entries?.length ?? "?"} entries`;
    }
    if (result.name === "search_files") {
      const count = parsed["count"] as number | undefined;
      return `found ${count ?? "?"} files`;
    }
    if (result.name === "search_text") {
      const matches = parsed["matches"] as unknown[] | undefined;
      return `${matches?.length ?? "?"} matches`;
    }
    if (result.name === "write_file") {
      return (parsed["message"] as string | undefined) ?? "wrote file";
    }
    if (result.name === "str_replace") {
      const changed = parsed["linesChanged"] as number | undefined;
      return `${changed ?? "?"} lines changed`;
    }
    if (result.name === "get_cwd") {
      return `cwd: ${parsed["cwd"] ?? ""}`;
    }
    return result.output.slice(0, 80);
  } catch {
    return result.output.slice(0, 80);
  }
}

function buildDiffEntry(call: ToolCallRequest): DiffEntry | undefined {
  const filePath = call.parameters["path"] as string | undefined;
  const oldStr = call.parameters["old_string"] as string | undefined;
  const newStr = call.parameters["new_string"] as string | undefined;
  if (!filePath || oldStr === undefined || newStr === undefined) return undefined;

  const removeLines = oldStr.split("\n").map((content, i) => ({
    type: "remove" as const,
    lineNo: i + 1,
    content,
  }));
  const addLines = newStr.split("\n").map((content, i) => ({
    type: "add" as const,
    lineNo: i + 1,
    content,
  }));

  return {
    file: filePath,
    added: addLines.length,
    removed: removeLines.length,
    lines: [...removeLines, ...addLines],
  };
}

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_TASKS: Task[] = [
  { id: "orchestrator", label: "Plan task", status: "pending" },
  { id: "file-picker", label: "Read files", status: "pending" },
  { id: "executor", label: "Execute changes", status: "pending" },
  { id: "reviewer", label: "Review & respond", status: "pending" },
];

function makeInitialStats(): AgentStats {
  const model = (process.env["NVIDIA_MODEL"] ?? "meta/llama-3.1-8b-instruct") as AvailableModelId;
  return { model, tokens: 0, steps: 0, totalSteps: 20, elapsed: 0 };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAgentReturn {
  tasks: Task[];
  files: FileEntry[];
  log: LogEntry[];
  stats: AgentStats;
  shell: ShellState;
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
  const [shell, setShell] = useState<ShellState>({ command: "", output: [] });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(() => createChatId());
  const [savedChats, setSavedChats] = useState<StoredChatSummary[]>(() => listSavedChats());

  const clientRef = useRef(new Client());
  const runStateRef = useRef<RunState | undefined>(undefined);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Refs for accumulating streaming data without causing re-renders
  const thinkingBuffersRef = useRef<Record<string, string>>({});
  const reviewerBufferRef = useRef("");
  const pendingToolCallsRef = useRef<Record<string, ToolCallRequest>>({});

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const pushLog = useCallback((entry: Omit<LogEntry, "id" | "time">) => {
    setLog((prev) => [...prev, { ...entry, id: makeId(), time: timeStamp() }]);
  }, []);

  const setTaskStatus = useCallback((id: string, status: Task["status"]) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t)),
    );
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

  // Clean up timer on unmount
  useEffect(() => () => stopElapsedTimer(), [stopElapsedTimer]);

  // ─── Phase handler ─────────────────────────────────────────────────────────

  const onPhase = useCallback((phase: AgentPhase) => {
    switch (phase.type) {
      case "agent_start": {
        setTaskStatus(phase.agentId, "active");
        thinkingBuffersRef.current[phase.agentId] = "";
        if (phase.agentId === "reviewer") {
          reviewerBufferRef.current = "";
        }
        pushLog({ level: "info", message: `▶ ${phase.agentId}: ${phase.task}` });
        break;
      }

      case "agent_done": {
        // Flush accumulated thinking before marking done
        const thinking = thinkingBuffersRef.current[phase.agentId];
        if (thinking && thinking.trim()) {
          pushLog({ level: "think", message: thinking.trim() });
        }
        thinkingBuffersRef.current[phase.agentId] = "";

        setTaskStatus(phase.agentId, "done");
        pushLog({ level: "ok", message: `✓ ${phase.agentId}` });

        sessionLogger.log(chatId, `AGENT[${phase.agentId}]`, phase.output);
        break;
      }

      case "thinking": {
        thinkingBuffersRef.current[phase.agentId] =
          (thinkingBuffersRef.current[phase.agentId] ?? "") + phase.delta;
        break;
      }

      case "tool_call": {
        pendingToolCallsRef.current[phase.call.id] = phase.call;
        pushLog({ level: "tool", message: formatToolCall(phase.call) });

        // Update files sidebar immediately on read/write calls
        const callPath = phase.call.parameters["path"] as string | undefined;
        if (callPath) {
          if (phase.call.name === "read_file") {
            addFile(callPath, "read", "file");
          } else if (phase.call.name === "write_file") {
            addFile(callPath, "new", "file");
          } else if (phase.call.name === "str_replace") {
            addFile(callPath, "modified", "file");
          } else if (phase.call.name === "list_directory") {
            addFile(callPath, "none", "dir");
          }
        }

        // Update shell for search_text
        if (phase.call.name === "search_text") {
          const query = phase.call.parameters["query"] as string | undefined;
          setShell({
            command: `search: ${query ?? ""}`,
            output: [{ text: "Searching…", type: "pending" }],
          });
        }

        setStats((prev) => ({
          ...prev,
          steps: prev.steps + 1,
          tokens: prev.tokens + 200,
        }));

        sessionLogger.log(chatId, `TOOL_CALL[${phase.call.name}]`, JSON.stringify(phase.call.parameters, null, 2));
        break;
      }

      case "tool_result": {
        const result = phase.result;
        const savedCall = pendingToolCallsRef.current[result.id];

        if (result.error) {
          pushLog({ level: "error", message: result.error });
          if (result.name === "search_text") {
            setShell((prev) => ({
              ...prev,
              output: [{ text: result.error!, type: "fail" }],
            }));
          }
        } else if (result.name === "str_replace" && savedCall) {
          const diff = buildDiffEntry(savedCall);
          const callPath = savedCall.parameters["path"] as string | undefined;
          pushLog({
            level: "diff",
            message: callPath ?? result.name,
            diff,
          });
          if (callPath) {
            setShell({
              command: `str_replace: ${callPath}`,
              output: [{ text: summarizeToolResult(result), type: "success" }],
            });
          }
        } else if (result.name === "write_file" && savedCall) {
          const callPath = savedCall.parameters["path"] as string | undefined;
          if (callPath) {
            setShell({
              command: `write_file: ${callPath}`,
              output: [{ text: summarizeToolResult(result), type: "success" }],
            });
          }
          pushLog({ level: "ok", message: summarizeToolResult(result) });
        } else if (result.name === "search_text") {
          const summary = summarizeToolResult(result);
          setShell((prev) => ({
            ...prev,
            output: [{ text: summary, type: "success" }],
          }));
          pushLog({ level: "ok", message: summary });
        } else {
          pushLog({ level: "ok", message: summarizeToolResult(result) });
        }

        sessionLogger.log(
          chatId,
          `TOOL_RESULT[${result.name}]`,
          result.error ? `ERROR: ${result.error}` : result.output,
        );
        break;
      }

      case "delta": {
        if (phase.agentId === "reviewer") {
          reviewerBufferRef.current += phase.content;
        }
        break;
      }

      case "done": {
        const finalOutput = phase.finalOutput;
        if (finalOutput.trim()) {
          pushLog({
            level: "ok",
            message: finalOutput.length > 200 ? finalOutput.slice(0, 200) + "…" : finalOutput,
          });
        }
        reviewerBufferRef.current = "";
        break;
      }

      case "error": {
        // Mark any active task as error
        setTasks((prev) =>
          prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)),
        );
        pushLog({ level: "error", message: phase.message });
        sessionLogger.log(chatId, "ERROR", phase.message);
        break;
      }
    }
  }, [chatId, pushLog, setTaskStatus, addFile]);

  // ─── submit ───────────────────────────────────────────────────────────────

  const submit = useCallback(async (prompt: string) => {
    setBusy(true);
    setDone(false);

    // Reset state for new run
    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    setFiles([]);
    setShell({ command: "", output: [] });
    setStats(makeInitialStats());
    thinkingBuffersRef.current = {};
    reviewerBufferRef.current = "";
    pendingToolCallsRef.current = {};

    pushLog({ level: "info", message: `> ${prompt}` });
    sessionLogger.log(chatId, "USER", prompt);
    startElapsedTimer();

    try {
      // Track whether the swarm path emitted a "done" phase. If it didn't
      // (i.e. the non-swarm BaseAgent path was taken), we display the text
      // output ourselves after run() resolves.
      let doneEmitted = false;
      const wrappedOnPhase = (phase: Parameters<typeof onPhase>[0]) => {
        if (phase.type === "done") doneEmitted = true;
        onPhase(phase);
      };

      const state = await clientRef.current.run({
        prompt,
        previousState: runStateRef.current,
        onPhase: wrappedOnPhase,
      });

      runStateRef.current = state;
      saveRunState({ chatId, state });
      setSavedChats(listSavedChats());

      if (state.output.type === "error") {
        pushLog({ level: "error", message: state.output.message });
        sessionLogger.log(chatId, "ERROR", state.output.message);
      } else if (state.output.type === "text" && !doneEmitted) {
        // BaseAgent path: no "done" phase was emitted, so show the response here.
        const content = state.output.content.trim();
        if (content) {
          pushLog({ level: "ok", message: content });
          sessionLogger.log(chatId, "RESPONSE", content);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTasks((prev) =>
        prev.map((t) => (t.status === "active" ? { ...t, status: "error" } : t)),
      );
      pushLog({ level: "error", message: msg });
      sessionLogger.log(chatId, "ERROR", msg);
    } finally {
      stopElapsedTimer();
      setBusy(false);
      setDone(true);
    }
  }, [chatId, onPhase, pushLog, startElapsedTimer, stopElapsedTimer]);

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
    setShell({ command: "", output: [] });
    setStats(makeInitialStats());
    setTasks(INITIAL_TASKS.map((t) => ({ ...t, status: "pending" as const })));
    setSavedChats(listSavedChats());
    pushLog({ level: "ok", message: `Resumed session: ${targetId}` });
  }, [pushLog]);

  // ─── clearLog ─────────────────────────────────────────────────────────────

  const clearLog = useCallback(() => {
    setLog([]);
    setFiles([]);
    setShell({ command: "", output: [] });
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
        pushLog({ level: "info", message: "Stop is not yet supported mid-run." });
        break;

      case "model":
        pushLog({
          level: "info",
          message: `Current model: ${stats.model}. Set NVIDIA_MODEL env var to change.`,
        });
        break;

      case "help":
        pushLog({ level: "info", message: "/clear  — clear log and files" });
        pushLog({ level: "info", message: "/resume [id] — resume last (or specified) session" });
        pushLog({ level: "info", message: "/stop   — stop running agent (not yet supported)" });
        pushLog({ level: "info", message: "/model  — show current model info" });
        pushLog({ level: "info", message: "/help   — show this help" });
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
    shell,
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

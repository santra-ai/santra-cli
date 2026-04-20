import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentPhase,
  AvailableModelId,
  RunState,
  ToolCallResult,
} from "@santra/shared";
import type { FileChangeFeedback, UserQuestion } from "@santra/agent-runtime";
import { Client } from "../../client.ts";
import { readConfig } from "../../utils/config.ts";
import {
  createChatId,
  listSavedChats,
  loadRunState,
  saveRunState,
  type StoredChatSummary,
} from "../../utils/run-state-storage.ts";
import { sessionLogger } from "../../utils/session-logger.ts";
import { buildDiff } from "../../utils/diff.ts";
import type {
  AgentStats,
  DiffEntry,
  FileEntry,
  LogEntry,
  Task,
} from "../types.ts";
import { LogDeriver, cleanAgentResponse } from "../run-events/LogDeriver.ts";

function timeStamp(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function makeId(): string {
  return Math.random().toString(36).substring(2, 8);
}

const EMPTY_RUN_FALLBACK =
  "I finished the run, but I did not produce a visible final response.";
const FIRST_ACTIVITY_TIMEOUT_MS = 30_000;
const IDLE_ACTIVITY_TIMEOUT_MS = 45_000;

type LiveStreamMode = "text" | "think" | "status" | "next";

function normalizeAgentMarkupChunk(text: string): string {
  return text
    .replace(/<thinking\b[^>]*>/gi, "<think>")
    .replace(/<\/thinking\s*>/gi, "</think>")
    .replace(/<think\b[^>]*>/gi, "<think>")
    .replace(/<\/think\s*>/gi, "</think>")
    .replace(/<short\b[^>]*>/gi, "<status>")
    .replace(/<\/short\s*>/gi, "</status>")
    .replace(/<step\b[^>]*>/gi, "<status>")
    .replace(/<\/step\s*>/gi, "</status>")
    .replace(/<heading\b[^>]*>/gi, "<status>")
    .replace(/<\/heading\s*>/gi, "</status>")
    .replace(/<status\b[^>]*>/gi, "<status>")
    .replace(/<\/status\s*>/gi, "</status>")
    .replace(/<next\b[^>]*>/gi, "<next>")
    .replace(/<\/next\s*>/gi, "</next>")
    .replace(/<\/<\s*thinking\s*>/gi, "</think>")
    .replace(/<\/<\s*think\s*>/gi, "</think>")
    .replace(/<\/<\s*short\s*>/gi, "</status>")
    .replace(/<\/<\s*step\s*>/gi, "</status>")
    .replace(/<\/<\s*heading\s*>/gi, "</status>")
    .replace(/<\/<\s*status\s*>/gi, "</status>")
    .replace(/<\/<\s*next\s*>/gi, "</next>");
}

function earliestTagIndex(text: string, tags: string[]): number {
  let idx = Infinity;
  for (const tag of tags) {
    const found = text.indexOf(tag);
    if (found !== -1) idx = Math.min(idx, found);
  }
  return idx === Infinity ? -1 : idx;
}

function stripTrailingPartialTag(
  text: string,
  tag: string,
): {
  safe: string;
  pending: string;
} {
  for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) {
      return {
        safe: text.slice(0, -len),
        pending: text.slice(-len),
      };
    }
  }

  return { safe: text, pending: "" };
}

function pathDepth(path: string): number {
  return path.replace(/^\//, "").split("/").length - 1;
}

function pathName(path: string): string {
  return path.split("/").pop() ?? path;
}

function buildErroredRunState(
  previousState: RunState | undefined,
  prompt: string,
  error: string,
): RunState {
  const previousMessages = previousState?.messages ?? [];
  const nextMessages = [...previousMessages];
  const trimmedPrompt = prompt.trim();

  if (
    trimmedPrompt &&
    !nextMessages.some(
      (message) =>
        message.role === "user" && message.content.trim() === trimmedPrompt,
    )
  ) {
    nextMessages.push({ role: "user", content: prompt });
  }

  nextMessages.push({
    role: "assistant",
    content: [
      `Continuation context for: ${prompt}`,
      `Last error: ${error}`,
      "Resume from this exact point. Use the prior repository context and do not restart unnecessarily.",
    ].join("\n"),
  });

  return {
    messages: nextMessages,
    output: { type: "error", message: error },
  };
}

const LOGIN_URL =
  process.env["SANTRA_LOGIN_URL"] ?? "http://localhost:3000/login";

function labelForAgent(id: string): string {
  return (
    TASK_LABELS[id] ??
    id
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function currentAgentOrchestrator(id: string): string {
  return id === "unknown" ? "orchestrator" : id;
}

function upsertFile(
  prev: FileEntry[],
  filePath: string,
  status: FileEntry["status"],
  type: FileEntry["type"],
): FileEntry[] {
  const existing = prev.find((file) => file.path === filePath);
  if (existing) {
    const rank = { none: 0, read: 1, modified: 2, new: 2 };
    if (rank[status] <= rank[existing.status]) return prev;
    return prev.map((file) =>
      file.path === filePath ? { ...file, status } : file,
    );
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

const TASK_LABELS: Record<string, string> = {
  orchestrator: "Main agent",
  "file-picker": "Find files",
  reader: "Read code",
  executor: "Edit code",
  reviewer: "Review work",
  thinker: "Think deeply",
};

const INITIAL_TASKS: Task[] = [
  {
    id: "orchestrator",
    label: TASK_LABELS["orchestrator"] ?? "Main agent",
    status: "pending",
  },
];

function makeInitialStats(): AgentStats {
  const config = readConfig();
  const model = (config?.model ?? process.env["NVIDIA_MODEL"] ?? "meta/llama-3.1-8b-instruct") as AvailableModelId;
  return {
    model,
    tokens: 0,
    steps: 0,
    totalSteps: 20,
    elapsed: 0,
    toolCalls: 0,
  };
}

export interface UseAgentReturn {
  tasks: Task[];
  files: FileEntry[];
  log: LogEntry[];
  stats: AgentStats;
  done: boolean;
  busy: boolean;
  chatId: string;
  savedChats: StoredChatSummary[];
  pendingApproval: PendingApproval | null;
  pendingQuestion: PendingQuestion | null;
  submit: (prompt: string) => Promise<void>;
  resume: (chatId?: string) => void;
  clearLog: () => void;
  handleCommand: (cmd: string, arg?: string) => void;
  abortCurrentRun: (source: "slash" | "keyboard") => void;
  resolveApproval: (decision: ApprovalDecision, message?: string) => void;
  resolveQuestion: (answer: string) => void;
}

export type ApprovalDecision = "allow" | "reject" | "allow_all" | "feedback";

export interface PendingApproval {
  callId: string;
  filePath: string;
  summary: string;
  diff: DiffEntry;
}

export interface PendingQuestion {
  prompt: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
}

export default function useAgent(): UseAgentReturn {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<AgentStats>(makeInitialStats);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(() => createChatId());
  const [savedChats, setSavedChats] = useState<StoredChatSummary[]>(() =>
    listSavedChats(),
  );
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(
    null,
  );
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(
    null,
  );

  const clientRef = useRef(new Client());
  const runStateRef = useRef<RunState | undefined>(undefined);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const logDeriverRef = useRef(new LogDeriver());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const runIdRef = useRef("");
  const seqRef = useRef(0);
  const abortSourceRef = useRef<"slash" | "keyboard">("slash");
  const activeAgentIdRef = useRef("unknown");
  const approvalResolverRef = useRef<
    | ((feedback: FileChangeFeedback) => void)
    | undefined
  >(undefined);
  const questionResolverRef = useRef<((answer: string) => void) | undefined>(
    undefined,
  );
  const approvalCacheRef = useRef<{
    allowAll: boolean;
    allowedFiles: Set<string>;
  }>({
    allowAll: false,
    allowedFiles: new Set<string>(),
  });
  const liveStreamModeRef = useRef<LiveStreamMode>("text");
  const liveStreamPendingRef = useRef("");
  const liveStatusBufferRef = useRef("");
  const liveNextBufferRef = useRef("");
  const sawRealtimeThinkingRef = useRef(false);
  const sawRealtimeResponseRef = useRef(false);
  const sawInteractivePromptRef = useRef(false);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sawRunActivityRef = useRef(false);
  const timedOutRunRef = useRef(false);

  // Flush timer cleanup on unmount
  useEffect(
    () => () => {
      if (flushTimerRef.current !== undefined)
        clearTimeout(flushTimerRef.current);
      if (activityTimerRef.current !== undefined)
        clearTimeout(activityTimerRef.current);
    },
    [],
  );

  // Batch React state updates, but keep the terminal feeling close to the
  // upstream stream speed.
  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== undefined) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = undefined;
      setLog(logDeriverRef.current.getLog());
    }, 8);
  }, []);

  const clearActivityTimer = useCallback(() => {
    if (activityTimerRef.current !== undefined) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = undefined;
    }
  }, []);

  const armActivityTimer = useCallback(
    (controller: AbortController, ms: number) => {
      clearActivityTimer();
      activityTimerRef.current = setTimeout(() => {
        timedOutRunRef.current = true;
        abortSourceRef.current = "slash";
        controller.abort();
      }, ms);
    },
    [clearActivityTimer],
  );

  const noteRunActivity = useCallback(
    (controller?: AbortController) => {
      sawRunActivityRef.current = true;
      if (controller) {
        armActivityTimer(controller, IDLE_ACTIVITY_TIMEOUT_MS);
      }
    },
    [armActivityTimer],
  );

  const appendEvent = useCallback(
    (event: Parameters<LogDeriver["processEvent"]>[0]) => {
      logDeriverRef.current.processEvent(event);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  function makeEvent<T extends { type: string }>(
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

  const handleRealtimeDelta = useCallback(
    (rawChunk: string) => {
      const streamAsFinalResponse = (
        agentId: string,
      ): agentId is "orchestrator" | "reader" | "executor" =>
        agentId === "orchestrator" ||
        agentId === "reader" ||
        agentId === "executor";

      const normalizedChunk = normalizeAgentMarkupChunk(rawChunk);

      let remaining = liveStreamPendingRef.current + normalizedChunk;
      liveStreamPendingRef.current = "";

      while (remaining.length > 0) {
        if (liveStreamModeRef.current === "text") {
          const thinkIdx = remaining.indexOf("<think>");
          const statusIdx = remaining.indexOf("<status>");
          const nextTagIdx = remaining.indexOf("<next>");
          const firstTag = Math.min(
            thinkIdx === -1 ? Infinity : thinkIdx,
            statusIdx === -1 ? Infinity : statusIdx,
            nextTagIdx === -1 ? Infinity : nextTagIdx,
          );
          if (firstTag === Infinity) {
            const partialGuard =
              ["<think>", "<status>", "<next>"].find((t) =>
                remaining.includes(t.slice(0, 3)),
              ) ?? "<think>";
            const { safe, pending } = stripTrailingPartialTag(
              remaining,
              partialGuard,
            );
            liveStreamPendingRef.current = pending;
            if (safe) {
              if (
                activeAgentIdRef.current === "unknown" ||
                streamAsFinalResponse(activeAgentIdRef.current)
              ) {
                sawRealtimeResponseRef.current = true;
                appendEvent(
                  makeEvent({
                    type: "response_delta",
                    agentId:
                      currentAgentOrchestrator(activeAgentIdRef.current),
                    content: safe,
                  }),
                );
              } else {
                appendEvent(
                  makeEvent({
                    type: "text_delta",
                    agentId: activeAgentIdRef.current,
                    content: safe,
                  }),
                );
              }
            }
            break;
          }

          const visible = remaining.slice(0, firstTag);
          if (visible) {
            const plainNextMatch = /^\s*(next|working)\s*:\s*([\s\S]+)$/i.exec(
              visible.trim(),
            );
            if (plainNextMatch) {
              const label = plainNextMatch[1] ?? "Next";
              const rest = (plainNextMatch[2] ?? "").trim();
              const normalized =
                `${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}: ${rest}`.trim();
              appendEvent(
                makeEvent({
                  type: "next_update",
                  agentId: currentAgentOrchestrator(activeAgentIdRef.current),
                  message: normalized,
                }),
              );
              remaining = remaining.slice(firstTag);
              continue;
            }

            if (
              activeAgentIdRef.current === "unknown" ||
              streamAsFinalResponse(activeAgentIdRef.current)
            ) {
              sawRealtimeResponseRef.current = true;
              appendEvent(
                makeEvent({
                  type: "response_delta",
                  agentId:
                    currentAgentOrchestrator(activeAgentIdRef.current),
                  content: visible,
                }),
              );
            } else {
              appendEvent(
                makeEvent({
                  type: "text_delta",
                  agentId: activeAgentIdRef.current,
                  content: visible,
                }),
              );
            }
          }

          if (firstTag === thinkIdx) {
            remaining = remaining.slice(thinkIdx + "<think>".length);
            liveStreamModeRef.current = "think";
          } else if (firstTag === statusIdx) {
            remaining = remaining.slice(statusIdx + "<status>".length);
            liveStreamModeRef.current = "status";
            liveStatusBufferRef.current = "";
          } else {
            remaining = remaining.slice(nextTagIdx + "<next>".length);
            liveStreamModeRef.current = "next";
            liveNextBufferRef.current = "";
          }
          continue;
        }

        if (liveStreamModeRef.current === "status") {
          const closeIdx = remaining.indexOf("</status>");
          const recoveryIdx = earliestTagIndex(remaining, [
            "<think>",
            "<next>",
            "<status>",
          ]);
          if (closeIdx === -1 && recoveryIdx === -1) {
            liveStatusBufferRef.current += remaining;
            liveStreamPendingRef.current = "";
            break;
          }

          const endIdx =
            closeIdx !== -1 && (recoveryIdx === -1 || closeIdx <= recoveryIdx)
              ? closeIdx
              : recoveryIdx;
          const status =
            `${liveStatusBufferRef.current}${remaining.slice(0, endIdx)}`.trim();
          if (status) {
            appendEvent(
              makeEvent({
                type: "status_update",
                agentId: currentAgentOrchestrator(activeAgentIdRef.current),
                message: status,
              }),
            );
          }
          liveStatusBufferRef.current = "";
          if (closeIdx !== -1 && endIdx === closeIdx) {
            remaining = remaining.slice(closeIdx + "</status>".length);
            liveStreamModeRef.current = "text";
          } else {
            remaining = remaining.slice(endIdx);
            liveStreamModeRef.current = "text";
          }
          continue;
        }

        if (liveStreamModeRef.current === "next") {
          const closeIdx = remaining.indexOf("</next>");
          const recoveryIdx = earliestTagIndex(remaining, [
            "<think>",
            "<status>",
            "<next>",
          ]);
          const agentId = currentAgentOrchestrator(activeAgentIdRef.current);

          if (closeIdx === -1 && recoveryIdx === -1) {
            liveNextBufferRef.current += remaining;
            // Stream partial update so the line appears live
            if (liveNextBufferRef.current.trim()) {
              appendEvent(
                makeEvent({
                  type: "next_update",
                  agentId,
                  message: liveNextBufferRef.current,
                }),
              );
            }
            liveStreamPendingRef.current = "";
            break;
          }

          const endIdx =
            closeIdx !== -1 && (recoveryIdx === -1 || closeIdx <= recoveryIdx)
              ? closeIdx
              : recoveryIdx;
          const msg =
            `${liveNextBufferRef.current}${remaining.slice(0, endIdx)}`.trim();
          if (msg) {
            appendEvent(
              makeEvent({ type: "next_update", agentId, message: msg }),
            );
          }
          liveNextBufferRef.current = "";
          if (closeIdx !== -1 && endIdx === closeIdx) {
            remaining = remaining.slice(closeIdx + "</next>".length);
            liveStreamModeRef.current = "text";
          } else {
            remaining = remaining.slice(endIdx);
            liveStreamModeRef.current = "text";
          }
          continue;
        }

        const closeIdx = remaining.indexOf("</think>");
        const recoveryIdx = earliestTagIndex(remaining, [
          "<status>",
          "<next>",
          "<think>",
        ]);
        if (closeIdx === -1 && recoveryIdx === -1) {
          const { safe, pending } = stripTrailingPartialTag(
            remaining,
            "</think>",
          );
          liveStreamPendingRef.current = pending;
          if (safe) {
            sawRealtimeThinkingRef.current = true;
            appendEvent(
              makeEvent({
                type: "reasoning_delta",
                agentId: currentAgentOrchestrator(activeAgentIdRef.current),
                delta: safe,
              }),
            );
          }
          break;
        }

        const endIdx =
          closeIdx !== -1 && (recoveryIdx === -1 || closeIdx <= recoveryIdx)
            ? closeIdx
            : recoveryIdx;
        const reasoning = remaining.slice(0, endIdx);
        if (reasoning) {
          sawRealtimeThinkingRef.current = true;
          appendEvent(
            makeEvent({
              type: "reasoning_delta",
              agentId: currentAgentOrchestrator(activeAgentIdRef.current),
              delta: reasoning,
            }),
          );
        }

        if (closeIdx !== -1 && endIdx === closeIdx) {
          remaining = remaining.slice(closeIdx + "</think>".length);
        } else {
          remaining = remaining.slice(endIdx);
        }
        liveStreamModeRef.current = "text";
      }
    },
    [appendEvent],
  );

  const setTaskStatus = useCallback((id: string, status: Task["status"]) => {
    setTasks((prev) =>
      prev.some((task) => task.id === id)
        ? prev.map((task) => (task.id === id ? { ...task, status } : task))
        : [
            ...prev,
            {
              id,
              label: labelForAgent(id),
              status,
            },
          ],
    );
  }, []);

  const addFile = useCallback(
    (
      filePath: string,
      status: FileEntry["status"],
      type: FileEntry["type"],
    ) => {
      setFiles((prev) => upsertFile(prev, filePath, status, type));
    },
    [],
  );

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

  const onPhase = useCallback(
    (phase: AgentPhase) => {
      switch (phase.type) {
        case "agent_start":
          setTaskStatus(phase.agentId, "active");
          activeAgentIdRef.current = phase.agentId;
          appendEvent(
            makeEvent({
              type: "agent_started",
              agentId: phase.agentId,
              task: phase.task,
            }),
          );
          break;

        case "agent_done":
          setTaskStatus(phase.agentId, "done");
          appendEvent(
            makeEvent({
              type: "agent_completed",
              agentId: phase.agentId,
              output: phase.output,
            }),
          );
          sessionLogger.log(chatId, `AGENT[${phase.agentId}]`, phase.output);
          activeAgentIdRef.current = "unknown";
          break;

        case "thinking":
          appendEvent(
            makeEvent({
              type: "reasoning_delta",
              agentId: phase.agentId,
              delta: phase.delta,
            }),
          );
          break;

        case "status":
          appendEvent(
            makeEvent({
              type: "status_update",
              agentId: phase.agentId,
              message: phase.message,
            }),
          );
          break;

        case "next":
          appendEvent(
            makeEvent({
              type: "next_update",
              agentId: phase.agentId,
              message: phase.message,
            }),
          );
          break;

        case "model_call_start":
          appendEvent(
            makeEvent({
              type: "model_call_started",
              agentId: phase.agentId,
              turn: phase.turn,
              summary: phase.summary,
            }),
          );
          break;

        case "model_call_end":
          appendEvent(
            makeEvent({
              type: "model_call_completed",
              agentId: phase.agentId,
              turn: phase.turn,
              summary: phase.summary,
              ...(phase.detail ? { detail: phase.detail } : {}),
            }),
          );
          break;

        case "delta":
          appendEvent(
            makeEvent({
              type: "text_delta",
              agentId: phase.agentId,
              content: phase.content,
            }),
          );
          break;

        case "tool_call": {
          const call = phase.call;
          appendEvent(
            makeEvent({
              type: "tool_call_started",
              toolCallId: call.id,
              agentId: phase.agentId,
              name: call.name,
              parameters: call.parameters,
            }),
          );

          const callPath = call.parameters["path"] as string | undefined;
          if (callPath) {
            if (call.name === "read_file") addFile(callPath, "read", "file");
            else if (call.name === "write_file")
              addFile(callPath, "new", "file");
            else if (call.name === "str_replace")
              addFile(callPath, "modified", "file");
            else if (call.name === "list_directory")
              addFile(callPath, "none", "dir");
          }

          setStats((prev) => ({
            ...prev,
            steps: prev.steps + 1,
            toolCalls: prev.toolCalls + 1,
            tokens: prev.tokens + 200,
          }));

          sessionLogger.log(
            chatId,
            `TOOL_CALL[${call.name}]`,
            JSON.stringify(call.parameters, null, 2),
          );
          break;
        }

        case "tool_result": {
          const result: ToolCallResult = phase.result;
          // Look up parameters from the deriver's pending tool state (O(1), no event scan)
          const pendingParams =
            logDeriverRef.current.lookupPendingToolParams(result.id) ?? {};
          appendEvent(
            makeEvent({
              type: "tool_call_completed",
              toolCallId: result.id,
              agentId: phase.agentId,
              name: result.name,
              parameters: pendingParams,
              output: result.output,
              ...(result.error ? { error: result.error } : {}),
            }),
          );
          sessionLogger.log(
            chatId,
            `TOOL_RESULT[${result.name}]`,
            result.error
              ? `ERROR: ${result.error}`
              : result.output.slice(0, 200),
          );
          break;
        }

        case "done":
          // Handled via state.output when client.run() resolves to prevent duplicate events.
          break;

        case "error":
          setTasks((prev) =>
            prev.map((task) =>
              task.status === "active" ? { ...task, status: "error" } : task,
            ),
          );
          appendEvent(
            makeEvent({ type: "run_failed", message: phase.message }),
          );
          sessionLogger.log(chatId, "ERROR", phase.message);
          break;
      }
    },
    [chatId, appendEvent, setTaskStatus, addFile],
  );

  const onFileChangeReview = useCallback(
    (
      callId: string,
      filePath: string,
      oldStr: string,
      newStr: string,
    ): Promise<FileChangeFeedback> => {
      const diff: DiffEntry = buildDiff(filePath, oldStr, newStr, 3);

      if (
        approvalCacheRef.current.allowAll ||
        approvalCacheRef.current.allowedFiles.has(filePath)
      ) {
        return Promise.resolve({ decision: "keep" as const });
      }

      const summary =
        diff.added === 0 && diff.removed === 0
          ? `Update ${filePath}`
          : `Update ${filePath} (+${diff.added} -${diff.removed})`;

      return new Promise<FileChangeFeedback>((resolve) => {
        sawInteractivePromptRef.current = true;
        approvalResolverRef.current = resolve;
        setPendingApproval({
          callId,
          filePath,
          summary,
          diff,
        });
      });
    },
    [appendEvent],
  );

  const resolveApproval = useCallback(
    (decision: ApprovalDecision, message?: string) => {
      const pending = pendingApproval;
      const resolver = approvalResolverRef.current;
      if (!pending || !resolver) return;

      approvalResolverRef.current = undefined;
      setPendingApproval(null);

      if (decision === "allow_all") {
        approvalCacheRef.current.allowAll = true;
        approvalCacheRef.current.allowedFiles.add(pending.filePath);
        resolver({ decision: "keep" });
        return;
      }

      if (decision === "allow") {
        approvalCacheRef.current.allowedFiles.add(pending.filePath);
        resolver({ decision: "keep" });
        return;
      }

      if (decision === "feedback") {
        const feedback = message?.trim();
        if (!feedback) {
          setPendingApproval(pending);
          approvalResolverRef.current = resolver;
          return;
        }
        resolver({ decision: "feedback", message: feedback });
        return;
      }

      resolver({ decision: "revert" });
    },
    [pendingApproval],
  );

  const onUserQuestion = useCallback(
    (questions: UserQuestion[]): Promise<string> => {
      const first = questions.find(
        (question) => typeof question.question === "string" && question.question.trim(),
      );
      if (!first) return Promise.resolve("");

      return new Promise<string>((resolve) => {
        sawInteractivePromptRef.current = true;
        questionResolverRef.current = resolve;
        setPendingQuestion({
          prompt: first.question.trim(),
          header:
            typeof first.header === "string" && first.header.trim()
              ? first.header.trim()
              : undefined,
          options: Array.isArray(first.options)
            ? first.options
                .filter(
                  (option): option is { label: string; description?: string } =>
                    !!option &&
                    typeof option === "object" &&
                    typeof option.label === "string" &&
                    option.label.trim().length > 0,
                )
                .map((option) => ({
                  label: option.label.trim(),
                  ...(typeof option.description === "string" &&
                  option.description.trim()
                    ? { description: option.description.trim() }
                    : {}),
                }))
            : [],
        });
      });
    },
    [],
  );

  const resolveQuestion = useCallback((answer: string) => {
    const resolver = questionResolverRef.current;
    if (!resolver) return;
    questionResolverRef.current = undefined;
    setPendingQuestion(null);
    resolver(answer.trim());
  }, []);

  const submit = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setDone(false);
      setTasks(
        INITIAL_TASKS.map((task) => ({
          ...task,
          status:
            task.id === "orchestrator"
              ? ("active" as const)
              : ("pending" as const),
        })),
      );
      setStats(makeInitialStats());

      // Cancel any pending flush and reset deriver for fresh run
      if (flushTimerRef.current !== undefined) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
      liveStreamModeRef.current = "text";
      liveStreamPendingRef.current = "";
      liveStatusBufferRef.current = "";
      liveNextBufferRef.current = "";
      sawRealtimeThinkingRef.current = false;
      sawRealtimeResponseRef.current = false;
      sawInteractivePromptRef.current = false;
      sawRunActivityRef.current = false;
      timedOutRunRef.current = false;
      logDeriverRef.current.reset();
      runIdRef.current = makeId();
      seqRef.current = 0;
      abortSourceRef.current = "slash";
      if (approvalResolverRef.current) {
        approvalResolverRef.current({ decision: "revert" });
        approvalResolverRef.current = undefined;
      }
      setPendingApproval(null);
      if (questionResolverRef.current) {
        questionResolverRef.current("");
        questionResolverRef.current = undefined;
      }
      setPendingQuestion(null);

      appendEvent(makeEvent({ type: "user_message", content: prompt }));
      appendEvent(makeEvent({ type: "run_started" }));

      sessionLogger.log(chatId, "USER", prompt);
      startElapsedTimer();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      armActivityTimer(controller, FIRST_ACTIVITY_TIMEOUT_MS);

      try {
        let doneEmitted = false;

        // Thin wrapper: track whether done fired to prevent double-emission
        const wrappedOnPhase = (phase: Parameters<typeof onPhase>[0]) => {
          if (phase.type === "thinking" && sawRealtimeThinkingRef.current)
            return;
          noteRunActivity(controller);
          if (phase.type === "done") doneEmitted = true;
          onPhase(phase);
        };

        const simulateStreaming = async (text: string) => {
          // Speed: roughly 80 chars per second
          const chunkSize = 4;
          for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            appendEvent(
              makeEvent({
                type: "response_delta",
                agentId: "agent",
                content: chunk,
              }),
            );
            await new Promise((r) => setTimeout(r, 15));
            if (controller.signal.aborted) break;
          }
        };

        const state = await clientRef.current.run({
          prompt,
          previousState: runStateRef.current,
          onDelta: (chunk) => {
            noteRunActivity(controller);
            handleRealtimeDelta(chunk);
          },
          onPhase: wrappedOnPhase,
          abortSignal: controller.signal,
          onFileChangeReview,
          onUserQuestion,
        });

        runStateRef.current = state;
        saveRunState({ chatId, state });
        setSavedChats(listSavedChats());

        if (state.output.type === "error") {
          if (!controller.signal.aborted) {
            appendEvent(
              makeEvent({ type: "run_failed", message: state.output.message }),
            );
            sessionLogger.log(chatId, "ERROR", state.output.message);
          }
        } else if (state.output.type === "text") {
          const content = cleanAgentResponse(state.output.content.trim());
          const finalOutput = content || EMPTY_RUN_FALLBACK;
          const isBrokenEmptyCompletion =
            finalOutput === EMPTY_RUN_FALLBACK &&
            (!doneEmitted || sawInteractivePromptRef.current);

          if (isBrokenEmptyCompletion) {
            appendEvent(
              makeEvent({
                type: "run_failed",
                message:
                  "The run ended without a final response after waiting for input.",
              }),
            );
            sessionLogger.log(
              chatId,
              "ERROR",
              "The run ended without a final response after waiting for input.",
            );
          } else {
            if (!sawRealtimeResponseRef.current && finalOutput) {
            await simulateStreaming(finalOutput);
            }
            appendEvent(
              makeEvent({ type: "run_completed", finalOutput }),
            );
            sessionLogger.log(chatId, "RESPONSE", finalOutput);
          }
        }
      } catch (err) {
        const message = timedOutRunRef.current
          ? sawRunActivityRef.current
            ? "The run stalled without making progress and was stopped."
            : "The run did not produce any activity and was stopped."
          : err instanceof Error
            ? err.message
            : String(err);
        const erroredState = buildErroredRunState(
          runStateRef.current,
          prompt,
          message,
        );
        runStateRef.current = erroredState;
        saveRunState({ chatId, state: erroredState });
        setSavedChats(listSavedChats());
        if (!controller.signal.aborted || timedOutRunRef.current) {
          setTasks((prev) =>
            prev.map((task) =>
              task.status === "active" ? { ...task, status: "error" } : task,
            ),
          );
          appendEvent(makeEvent({ type: "run_failed", message }));
          sessionLogger.log(chatId, "ERROR", message);
        }
      } finally {
        clearActivityTimer();
        if (controller.signal.aborted) {
          if (!timedOutRunRef.current) {
            appendEvent(
              makeEvent({
                type: "run_interrupted",
                source: abortSourceRef.current,
              }),
            );
          }
        }
        // Flush any remaining buffered events immediately on run end
        if (flushTimerRef.current !== undefined) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        setLog(logDeriverRef.current.getLog());

        abortControllerRef.current = undefined;
        stopElapsedTimer();
        setBusy(false);
        setDone(true);
      }
    },
    [
      chatId,
      onFileChangeReview,
      onUserQuestion,
      onPhase,
      appendEvent,
      startElapsedTimer,
      stopElapsedTimer,
      armActivityTimer,
      clearActivityTimer,
      noteRunActivity,
    ],
  );

  const resume = useCallback(
    (resumeChatId?: string) => {
      let targetId = resumeChatId;
      if (!targetId) {
        const chats = listSavedChats();
        if (chats.length === 0) {
          appendEvent(
            makeEvent({
              type: "run_failed",
              message: "No saved sessions found.",
            }),
          );
          return;
        }
        targetId = chats[0]!.chatId;
      }

      const state = loadRunState(targetId);
      if (!state) {
        appendEvent(
          makeEvent({
            type: "run_failed",
            message: `Could not load session: ${targetId}`,
          }),
        );
        return;
      }

      runStateRef.current = state;
      setChatId(targetId);
      setFiles([]);
      setStats(makeInitialStats());
      setTasks(
        INITIAL_TASKS.map((task) => ({ ...task, status: "pending" as const })),
      );
      setSavedChats(listSavedChats());
      setLog((prev) => [
        ...prev,
        {
          id: makeId(),
          time: timeStamp(),
          level: "ok",
          message: `Resumed session: ${targetId}`,
        },
      ]);
    },
    [appendEvent],
  );

  const clearLog = useCallback(() => {
    if (flushTimerRef.current !== undefined) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    logDeriverRef.current.reset();
    setLog([]);
    setFiles([]);
  }, []);

  const abortCurrentRun = useCallback((source: "slash" | "keyboard") => {
      if (!abortControllerRef.current) return;
      abortSourceRef.current = source;
      if (approvalResolverRef.current) {
        approvalResolverRef.current({ decision: "revert" });
        approvalResolverRef.current = undefined;
        setPendingApproval(null);
      }
      if (questionResolverRef.current) {
        questionResolverRef.current("");
        questionResolverRef.current = undefined;
        setPendingQuestion(null);
      }
      abortControllerRef.current.abort();
    }, []);

  const handleCommand = useCallback(
    (cmd: string, arg?: string) => {
      const command = cmd.replace(/^\//, "").toLowerCase();
      switch (command) {
        case "clear":
          clearLog();
          break;
        case "resume":
          resume(arg?.trim() || undefined);
          break;
        case "stop":
          if (abortControllerRef.current) {
            abortCurrentRun("slash");
            setLog((prev) => [
              ...prev,
              {
                id: makeId(),
                time: timeStamp(),
                level: "info",
                message: "Agent stopped.",
              },
            ]);
          } else {
            setLog((prev) => [
              ...prev,
              {
                id: makeId(),
                time: timeStamp(),
                level: "info",
                message: "No agent is running.",
              },
            ]);
          }
          break;
        case "model":
          setLog((prev) => [
            ...prev,
            {
              id: makeId(),
              time: timeStamp(),
              level: "info",
              message: `Model: ${stats.model}`,
            },
          ]);
          break;
        case "help":
          setLog((prev) => [
            ...prev,
            {
              id: makeId(),
              time: timeStamp(),
              level: "info",
              message:
                "/clear  /copy  /resume [id]  /stop  /model  /setup  /login  /help",
            },
          ]);
          break;
        case "login":
          setLog((prev) => [
            ...prev,
            {
              id: makeId(),
              time: timeStamp(),
              level: "info",
              message: `Open ${LOGIN_URL} to sign in with Google or GitHub. After login, run /setup in the terminal.`,
            },
          ]);
          break;
        case "setup":
          // handled by App.tsx — no-op here to prevent "unknown command"
          break;
        default:
          setLog((prev) => [
            ...prev,
            {
              id: makeId(),
              time: timeStamp(),
              level: "error",
              message: `Unknown command: /${command}`,
            },
          ]);
      }
    },
    [abortCurrentRun, clearLog, resume, stats.model],
  );

  return {
    tasks,
    files,
    log,
    stats,
    done,
    busy,
    chatId,
    savedChats,
    pendingApproval,
    pendingQuestion,
    submit,
    resume,
    clearLog,
    handleCommand,
    abortCurrentRun,
    resolveApproval,
    resolveQuestion,
  };
}

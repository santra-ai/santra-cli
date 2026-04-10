import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ActivityEvent } from "../types.ts";
import type { RunState, AgentPhase, Message } from "@santra/shared";
import { Client } from "../../client.ts";
import {
  createChatId,
  loadRunState,
  saveRunState,
} from "../../utils/run-state-storage.ts";
import { sessionLogger } from "../../utils/session-logger.ts";

interface UseChatReturn {
  messages: ChatMessage[];
  streamingText: string;
  streamingAgent: string | null;
  activity: ActivityEvent[];
  currentAgent: string | null;
  thinkingSnippet: string | null;
  busy: boolean;
  chatId: string;
  submit: (prompt: string) => Promise<void>;
  resume: (chatId: string) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreaming] = useState("");
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [thinkingSnippet, setThinkingSnippet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState(() => createChatId());

  const runStateRef = useRef<RunState | undefined>(undefined);
  const clientRef = useRef(new Client());

  // Per-agent streaming buffers — accumulated for logging, only reviewer shown in UI
  const agentBuffersRef = useRef<Record<string, string>>({});
  const finalBufferRef = useRef("");

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const pushActivity = useCallback((e: ActivityEvent) => {
    setActivity((prev) => [...prev.slice(-50), e]);
  }, []);

  const resume = useCallback(
    (resumeChatId: string) => {
      const state = loadRunState(resumeChatId);

      if (!state) {
        appendMessage({
          role: "error",
          text: `Could not load session: ${resumeChatId}`,
        });
        return;
      }

      runStateRef.current = state;
      setChatId(resumeChatId);
      setActivity([]);
      setStreaming("");
      setStreamingAgent(null);
      setThinkingSnippet(null);

      setMessages(
        state.messages
          .map((message: Message): ChatMessage | null => {
            if (message.role === "system") return null;
            return {
              role: message.role === "assistant" ? "agent" : "user",
              text: message.content,
            };
          })
          .filter((m): m is ChatMessage => m !== null),
      );
    },
    [appendMessage],
  );

  const submit = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setActivity([]);
      agentBuffersRef.current = {};
      finalBufferRef.current = "";
      setThinkingSnippet(null);
      appendMessage({ role: "user", text: prompt });

      sessionLogger.log(chatId, "USER", prompt);

      const onPhase = (phase: AgentPhase) => {
        switch (phase.type) {
          case "agent_start":
            setCurrentAgent(phase.agentId);
            setThinkingSnippet(null);
            agentBuffersRef.current[phase.agentId] = "";
            if (phase.agentId === "reviewer") {
              finalBufferRef.current = "";
              setStreaming("");
              setStreamingAgent("reviewer");
            }
            pushActivity({
              type: "agent_start",
              agentId: phase.agentId,
              task: phase.task,
            });
            break;

          case "agent_done":
            setCurrentAgent(null);
            setThinkingSnippet(null);
            if (phase.agentId === "reviewer") {
              setStreaming("");
              setStreamingAgent(null);
            }
            pushActivity({ type: "agent_done", agentId: phase.agentId });
            sessionLogger.log(chatId, `AGENT[${phase.agentId}]`, phase.output);
            break;

          case "tool_call":
            pushActivity({ type: "tool_call", call: phase.call });
            sessionLogger.log(
              chatId,
              `TOOL_CALL[${phase.call.name}]`,
              JSON.stringify(phase.call.parameters, null, 2),
            );
            break;

          case "tool_result":
            pushActivity({ type: "tool_result", result: phase.result });
            sessionLogger.log(
              chatId,
              `TOOL_RESULT[${phase.result.name}]`,
              phase.result.error
                ? `ERROR: ${phase.result.error}`
                : phase.result.output,
            );
            break;

          case "thinking":
            setThinkingSnippet(
              phase.delta.replace(/\n/g, " ").trim().slice(0, 80),
            );
            pushActivity({
              type: "thinking",
              agentId: phase.agentId,
              snippet: phase.delta.slice(0, 80).replace(/\n/g, " ").trim(),
            });
            break;

          case "delta":
            agentBuffersRef.current[phase.agentId] =
              (agentBuffersRef.current[phase.agentId] ?? "") + phase.content;

            // Only stream the reviewer's output to the visible chat
            if (phase.agentId === "reviewer") {
              finalBufferRef.current += phase.content;
              setStreaming(finalBufferRef.current);
            }
            break;

          case "done":
            setStreaming("");
            setStreamingAgent(null);
            finalBufferRef.current = "";
            break;

          case "error":
            appendMessage({ role: "error", text: phase.message });
            sessionLogger.log(chatId, "ERROR", phase.message);
            break;
        }
      };

      try {
        const state = await clientRef.current.run({
          prompt,
          previousState: runStateRef.current,
          onPhase,
        });

        runStateRef.current = state;
        setStreaming("");
        setStreamingAgent(null);
        finalBufferRef.current = "";
        setCurrentAgent(null);
        setThinkingSnippet(null);

        saveRunState({ chatId, state });

        if (state.output.type === "error") {
          appendMessage({ role: "error", text: state.output.message });
          sessionLogger.log(chatId, "ERROR", state.output.message);
        } else if (state.output.type === "text") {
          appendMessage({ role: "agent", text: state.output.content });
          sessionLogger.log(chatId, "SANTRA", state.output.content);
        } else {
          appendMessage({ role: "agent", text: "" });
        }
      } catch (err) {
        setStreaming("");
        setStreamingAgent(null);
        finalBufferRef.current = "";
        setCurrentAgent(null);
        setThinkingSnippet(null);
        const msg = err instanceof Error ? err.message : String(err);
        appendMessage({ role: "error", text: msg });
        sessionLogger.log(chatId, "ERROR", msg);
      } finally {
        setBusy(false);
      }
    },
    [appendMessage, pushActivity, chatId],
  );

  return {
    messages,
    streamingText,
    streamingAgent,
    activity,
    currentAgent,
    thinkingSnippet,
    busy,
    chatId,
    submit,
    resume,
  };
}

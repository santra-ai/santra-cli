import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ActivityEvent } from "../types.ts";
import type { RunState, AgentPhase } from "@santra/shared";
import { Client } from "../../client.ts";

interface UseChatReturn {
  messages: ChatMessage[];
  streamingText: string;
  activity: ActivityEvent[];
  currentAgent: string | null;
  busy: boolean;
  submit: (prompt: string, useSwarm?: boolean) => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreaming] = useState("");
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runStateRef = useRef<RunState | undefined>(undefined);
  const clientRef = useRef(new Client());

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const pushActivity = useCallback((e: ActivityEvent) => {
    setActivity((prev) => [...prev.slice(-30), e]);
  }, []);

  const submit = useCallback(
    async (prompt: string, useSwarm = false) => {
      setBusy(true);
      setActivity([]);
      appendMessage({ role: "user", text: prompt });
      let buffer = "";

      const onPhase = (phase: AgentPhase) => {
        switch (phase.type) {
          case "agent_start":
            setCurrentAgent(phase.agentId);
            pushActivity({
              type: "agent_start",
              agentId: phase.agentId,
              task: phase.task,
            });
            break;
          case "agent_done":
            pushActivity({ type: "agent_done", agentId: phase.agentId });
            break;
          case "tool_call":
            pushActivity({ type: "tool_call", call: phase.call });
            break;
          case "tool_result":
            pushActivity({ type: "tool_result", result: phase.result });
            break;
          case "thinking":
            pushActivity({
              type: "thinking",
              agentId: phase.agentId,
              snippet: phase.delta.slice(0, 60).replace(/\n/g, " "),
            });
            break;
        }
      };

      try {
        const state = await clientRef.current.run({
          prompt,
          previousState: runStateRef.current,
          onDelta: (chunk) => {
            buffer += chunk;
            setStreaming(buffer);
          },
          onPhase,
          useSwarm,
        });

        runStateRef.current = state;
        setStreaming("");
        setCurrentAgent(null);

        if (state.output.type === "error") {
          appendMessage({ role: "error", text: state.output.message });
        } else if (state.output.type === "text") {
          appendMessage({ role: "agent", text: state.output.content });
        } else {
          appendMessage({ role: "agent", text: "" });
        }
      } catch (err) {
        setStreaming("");
        setCurrentAgent(null);
        appendMessage({
          role: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [appendMessage, pushActivity],
  );

  return { messages, streamingText, activity, currentAgent, busy, submit };
}

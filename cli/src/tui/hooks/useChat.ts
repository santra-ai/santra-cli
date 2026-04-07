import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import type { RunState } from "@santra/shared";
import { Client } from "../../client";

interface UseChatReturn {
  messages: ChatMessage[];
  streamingText: string;
  busy: boolean;
  submit: (prompt: string) => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);

  const runStateRef = useRef<RunState | undefined>(undefined);
  const clientRef = useRef(new Client());

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const submit = useCallback(
    async (prompt: string) => {
      setBusy(true);
      appendMessage({ role: "user", text: prompt });

      let buffer = " ";

      try {
        const state = await clientRef.current.run({
          prompt,
          previousState: runStateRef.current,
          onDelta: (chunk: string) => {
            buffer += chunk;
            setStreaming(buffer);
          },
        });

        runStateRef.current = state;
        setStreaming("");

        if (state.output.type === "error") {
          appendMessage({ role: "error", text: state.output.message });
        } else {
          appendMessage({ role: "agent", text: buffer });
        }
      } catch (err) {
        setStreaming("");
        appendMessage({
          role: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [appendMessage],
  );

  return { messages, streamingText, busy, submit };
}

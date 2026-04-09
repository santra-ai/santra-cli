import { Box, useInput } from "ink";
import { useState } from "react";
import { useChat } from "./hooks/useChat.ts";
import { Header } from "./components/Header.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { InputBar } from "./components/InputBar.tsx";
import { ActivityPanel } from "./components/ActivityPanel.tsx";

export function App() {
  const [input, setInput] = useState("");
  const { messages, streamingText, activity, currentAgent, busy, submit } =
    useChat();
  const isSwarm = input.startsWith("/swarm ");

  useInput((char, key) => {
    const isBS =
      key.backspace ||
      key.delete ||
      char === "\b" ||
      char === "\x7f" ||
      (key.ctrl && char?.toLowerCase() === "h");

    if (isBS) {
      setInput((p) => p.slice(0, -1));
      return;
    }
    if (busy) return;

    if (key.return) {
      const raw = input.trim();
      if (!raw) return;
      setInput("");
      const useSwarm = raw.startsWith("/swarm ");
      const prompt = useSwarm ? raw.slice("/swarm ".length).trim() : raw;
      if (!prompt) return;
      submit(prompt, useSwarm);
      return;
    }

    if (char && !key.ctrl && !key.meta) setInput((p) => p + char);
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />
      <MessageList messages={messages} streamingText={streamingText} />
      <ActivityPanel activity={activity} currentAgent={currentAgent} />
      <InputBar value={input} busy={busy} isSwarmMode={isSwarm} />
    </Box>
  );
}

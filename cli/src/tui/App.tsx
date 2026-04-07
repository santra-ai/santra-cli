import { Box } from "ink";
import { useInput } from "ink";
import { useState } from "react";
import { useChat } from "./hooks/useChat.ts";
import { Header } from "./components/Header.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { InputBar } from "./components/InputBar.tsx";

export function App() {
  const [inputValue, setInputValue] = useState("");
  const { messages, streamingText, busy, submit } = useChat();

  useInput(
    (
      char: string,
      key: {
        return?: boolean;
        backspace?: boolean;
        delete?: boolean;
        ctrl?: boolean;
        meta?: boolean;
      },
    ) => {
      const isBackspace =
        key.backspace ||
        key.delete ||
        char === "\b" ||
        char === "\x7f" ||
        (key.ctrl && char?.toLowerCase() === "h");

      if (isBackspace) {
        setInputValue((prev) => prev.slice(0, -1));
        return;
      }

      if (busy) return;

      if (key.return) {
        const prompt = inputValue.trim();
        if (!prompt) return;
        setInputValue("");
        submit(prompt);
        return;
      }

      if (char && !key.ctrl && !key.meta) {
        setInputValue((prev) => prev + char);
      }
    },
  );

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />
      <MessageList messages={messages} streamingText={streamingText} />
      <InputBar value={inputValue} busy={busy} />
    </Box>
  );
}

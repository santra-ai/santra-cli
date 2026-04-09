import { Box, Text } from "ink";
import { useInput } from "ink";
import { useState } from "react";
import { useChat } from "./hooks/useChat.ts";
import { Header } from "./components/Header.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { InputBar } from "./components/InputBar.tsx";
import {
  listSavedChats,
  type StoredChatSummary,
} from "../utils/run-state-storage.ts";
import { PALETTE } from "./constants.ts";

function ResumePicker({
  sessions,
  selectedIndex,
}: {
  sessions: StoredChatSummary[];
  selectedIndex: number;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={PALETTE.orangeDim}
      paddingX={1}
      marginX={2}
      marginBottom={1}
    >
      <Text color={PALETTE.orange} bold>
        resume session
      </Text>

      {sessions.length === 0 ? (
        <Text color={PALETTE.muted}>no saved sessions found</Text>
      ) : (
        sessions.map((session, index) => (
          <Text
            key={session.chatId}
            color={index === selectedIndex ? PALETTE.orange : PALETTE.white}
          >
            {index === selectedIndex ? "› " : "  "}
            {new Date(session.updatedAt).toLocaleString()} {session.preview}
          </Text>
        ))
      )}

      <Text color={PALETTE.muted}>
        {sessions.length === 0
          ? "press esc to close"
          : "up/down to select • enter to resume • esc to close"}
      </Text>
    </Box>
  );
}

export function App() {
  const [inputValue, setInputValue] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredChatSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { messages, streamingText, busy, submit, resume } = useChat();

  useInput(
    (
      char: string,
      key: {
        return?: boolean;
        backspace?: boolean;
        delete?: boolean;
        ctrl?: boolean;
        meta?: boolean;
        escape?: boolean;
        upArrow?: boolean;
        downArrow?: boolean;
      },
    ) => {
      if (resumeOpen) {
        if (key.escape) {
          setResumeOpen(false);
          return;
        }

        if (sessions.length === 0) {
          if (key.return) setResumeOpen(false);
          return;
        }

        if (key.upArrow) {
          setSelectedIndex((prev) =>
            prev === 0 ? sessions.length - 1 : prev - 1,
          );
          return;
        }

        if (key.downArrow) {
          setSelectedIndex((prev) =>
            prev === sessions.length - 1 ? 0 : prev + 1,
          );
          return;
        }

        if (key.return) {
          const session = sessions[selectedIndex];
          if (session) resume(session.chatId);
          setResumeOpen(false);
          return;
        }

        return;
      }

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

        if (prompt === "/resume") {
          const nextSessions = listSavedChats();
          setSessions(nextSessions);
          setSelectedIndex(0);
          setResumeOpen(true);
          setInputValue("");
          return;
        }

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
      {resumeOpen ? (
        <ResumePicker sessions={sessions} selectedIndex={selectedIndex} />
      ) : null}
      <InputBar value={inputValue} busy={busy} />
    </Box>
  );
}

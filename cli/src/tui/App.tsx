import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useChat } from "./hooks/useChat.ts";
import { Header } from "./components/Header.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { InputBar } from "./components/InputBar.tsx";
import { ActivityPanel } from "./components/ActivityPanel.tsx";
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
  const [input, setInput] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredChatSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { messages, streamingText, activity, currentAgent, busy, submit, resume } =
    useChat();
  const isSwarm = input.startsWith("/swarm ");

  useInput((char, key) => {
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

      if (raw === "/resume") {
        const nextSessions = listSavedChats();
        setSessions(nextSessions);
        setSelectedIndex(0);
        setResumeOpen(true);
        setInput("");
        return;
      }

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
      {resumeOpen ? (
        <ResumePicker sessions={sessions} selectedIndex={selectedIndex} />
      ) : null}
      <InputBar value={input} busy={busy} isSwarmMode={isSwarm} />
    </Box>
  );
}
    </Box>
  );
}

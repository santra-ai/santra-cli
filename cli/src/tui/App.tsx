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
        ◉ resume session
      </Text>

      {sessions.length === 0 ? (
        <Text color={PALETTE.muted}> no saved sessions found</Text>
      ) : (
        sessions.map((session, index) => (
          <Box key={session.chatId} gap={1}>
            <Text
              color={index === selectedIndex ? PALETTE.orange : PALETTE.muted}
            >
              {index === selectedIndex ? "›" : " "}
            </Text>
            <Text
              color={index === selectedIndex ? PALETTE.white : PALETTE.muted}
            >
              {new Date(session.updatedAt).toLocaleString()}
            </Text>
            <Text color={PALETTE.muted}>—</Text>
            <Text
              color={index === selectedIndex ? PALETTE.white : PALETTE.muted}
            >
              {session.preview}
            </Text>
          </Box>
        ))
      )}

      <Box marginTop={1}>
        <Text color={PALETTE.muted}>
          {sessions.length === 0
            ? "esc to close"
            : "↑↓ select  ·  enter resume  ·  esc cancel"}
        </Text>
      </Box>
    </Box>
  );
}

function HelpPanel() {
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
        ◆ commands
      </Text>
      <Box gap={2}>
        <Text color={PALETTE.muted}> /resume</Text>
        <Text color={PALETTE.white}>resume a previous session</Text>
      </Box>
      <Box gap={2}>
        <Text color={PALETTE.muted}> /help</Text>
        <Text color={PALETTE.white}>toggle this panel</Text>
      </Box>
      <Box gap={2}>
        <Text color={PALETTE.muted}> ctrl+c</Text>
        <Text color={PALETTE.white}>exit</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={PALETTE.muted}>
          santra will fan out through orchestrator → thinker → file-picker →
          planner → executor → reviewer when the task needs repo work
        </Text>
      </Box>
      <Box>
        <Text color={PALETTE.muted}>
          set SANTRA_DEV=1 to write full session logs to .santra-logs/
        </Text>
      </Box>
    </Box>
  );
}

export function App() {
  const [input, setInput] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sessions, setSessions] = useState<StoredChatSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const {
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
  } = useChat();

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

      if (raw === "/help") {
        setHelpOpen((v) => !v);
        setInput("");
        return;
      }

      setInput("");
      submit(raw);
      return;
    }

    if (char && !key.ctrl && !key.meta) setInput((p) => p + char);
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header chatId={chatId} />
      <MessageList
        messages={messages}
        streamingText={streamingText}
        streamingAgent={streamingAgent}
      />
      <ActivityPanel
        activity={activity}
        currentAgent={currentAgent}
        thinkingSnippet={thinkingSnippet}
      />
      {helpOpen && !resumeOpen && <HelpPanel />}
      {resumeOpen && (
        <ResumePicker sessions={sessions} selectedIndex={selectedIndex} />
      )}
      <InputBar value={input} busy={busy} currentAgent={currentAgent} />
    </Box>
  );
}

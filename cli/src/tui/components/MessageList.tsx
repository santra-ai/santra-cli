import { Box, Text, useStdout } from "ink";
import { EmptyState } from "./EmptyState.tsx";
import { ChatMessageRow } from "./ChatMessageRow.tsx";
import { StreamingMessage } from "./StreamingMessage.tsx";
import type { ChatMessage } from "../types.ts";

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  streamingAgent: string | null;
}

export function MessageList({
  messages,
  streamingText,
  streamingAgent,
}: MessageListProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;

  // Reserve lines: 3 header + 1 gap + 8 activity panel max + 3 input bar + 2 padding
  const reservedLines = 17;
  const availableLines = Math.max(termHeight - reservedLines, 6);

  const isEmpty = messages.length === 0 && streamingText === "";

  // Fit messages into available lines.
  // Each message is roughly: 1 label line + wrapping content lines + 1 blank.
  // We estimate and slice from the end to show the most recent.
  const visibleMessages = messages.slice(-12);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={2}
      paddingTop={1}
      overflow="hidden"
    >
      {isEmpty && <EmptyState />}

      {visibleMessages.map((msg, index) => (
        <ChatMessageRow key={index} message={msg} />
      ))}

      {streamingText !== "" && (
        <StreamingMessage
          text={streamingText}
          agentId={streamingAgent ?? undefined}
        />
      )}
    </Box>
  );
}

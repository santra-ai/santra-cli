import { Box } from "ink";
import { EmptyState } from "./EmptyState.tsx";
import { ChatMessageRow } from "./ChatMessageRow.tsx";
import { StreamingMessage } from "./StreamingMessage.tsx";
import type { ChatMessage } from "../types.ts";

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  const isEmpty = messages.length === 0 && streamingText === "";

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={2}
      paddingTop={1}
      overflow="hidden"
    >
      {isEmpty && <EmptyState />}

      {messages.map((msg, index) => (
        <ChatMessageRow key={index} message={msg} />
      ))}

      {streamingText !== "" && <StreamingMessage text={streamingText} />}
    </Box>
  );
}

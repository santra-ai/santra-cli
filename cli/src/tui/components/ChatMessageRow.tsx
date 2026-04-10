import { Box, Text } from "ink";
import { ROLE_LABEL, ROLE_LABEL_COLOR, ROLE_TEXT_COLOR } from "../constants.ts";
import type { ChatMessage } from "../types.ts";

interface ChatMessageRowProps {
  message: ChatMessage;
}

export function ChatMessageRow({ message }: ChatMessageRowProps) {
  // For agent messages, only show the last 60 lines to avoid flooding the terminal.
  // Full content is always in the session log.
  const text =
    message.role === "agent"
      ? message.text.split("\n").slice(-60).join("\n")
      : message.text;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={ROLE_LABEL_COLOR[message.role]} bold>
        {ROLE_LABEL[message.role]}
      </Text>
      <Text color={ROLE_TEXT_COLOR[message.role]} wrap="wrap">
        {"  "}
        {text}
      </Text>
    </Box>
  );
}

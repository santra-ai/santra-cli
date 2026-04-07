import { Box, Text } from "ink";
import { ROLE_LABEL, ROLE_LABEL_COLOR, ROLE_TEXT_COLOR } from "../constants.ts";
import type { ChatMessage } from "../types.ts";

interface ChatMessageRowProps {
  message: ChatMessage;
}

export function ChatMessageRow({ message }: ChatMessageRowProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={ROLE_LABEL_COLOR[message.role]} bold>
        {ROLE_LABEL[message.role]}
      </Text>
      <Text color={ROLE_TEXT_COLOR[message.role]} wrap="wrap">
        {"  "}
        {message.text}
      </Text>
    </Box>
  );
}

import { Box, Text } from "ink";
import { PALETTE, ROLE_LABEL } from "../constants.ts";

interface StreamingMessageProps {
  text: string;
}

export function StreamingMessage({ text }: StreamingMessageProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={PALETTE.orange} bold>
        {ROLE_LABEL.agent}
      </Text>
      <Text color={PALETTE.white} wrap="wrap">
        {"  "}
        {text}
        <Text color={PALETTE.orange}>▌</Text>
      </Text>
    </Box>
  );
}

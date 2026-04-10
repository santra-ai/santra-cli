import { Box, Text } from "ink";
import { PALETTE } from "../constants.ts";

interface Props {
  chatId?: string;
}

export function Header({ chatId }: Props) {
  const shortId = chatId ? chatId.slice(0, 19).replace("T", " ") : "";

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor={PALETTE.orangeDim}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={PALETTE.orange} bold>
          ◆ santra
        </Text>
        {shortId && <Text color={PALETTE.muted}>session {shortId}</Text>}
      </Box>
      <Box justifyContent="space-between">
        <Text color={PALETTE.muted}>
          cli coding assistant with smart research and execution
        </Text>
        <Text color={PALETTE.muted}>/help · /resume · ctrl+c exit</Text>
      </Box>
    </Box>
  );
}

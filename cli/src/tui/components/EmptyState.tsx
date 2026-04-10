import { Box, Text } from "ink";
import { PALETTE } from "../constants.ts";

export function EmptyState() {
  return (
    <Box flexDirection="column" gap={0} paddingX={1}>
      <Text color={PALETTE.orange} bold>
        ◆ welcome to santra
      </Text>
      <Text color={PALETTE.muted}> your local cli coding assistant</Text>
      <Text color={PALETTE.muted}> </Text>
      <Text color={PALETTE.white}> ask about the repo, a file, a bug, or a feature</Text>
      <Text color={PALETTE.muted}>
        {" "}
        santra answers simple chat directly and uses its agent pipeline when the
        task needs repo research, code edits, or verification
      </Text>
      <Text color={PALETTE.muted}> type /help to see all commands</Text>
      <Text color={PALETTE.muted}>
        {" "}
        type /resume to continue a previous session
      </Text>
    </Box>
  );
}

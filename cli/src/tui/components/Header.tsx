import { Box, Text } from "ink";
import { PALETTE } from "../constants.ts";

export function Header() {
  return (
    <Box borderStyle="single" borderColor={PALETTE.orangeDim} paddingX={1}>
      <Text color={PALETTE.orange} bold>
        ◆ santra
      </Text>
      <Text color={PALETTE.muted}>
        {"  "}intelligent cli agent{"  ·  "}ctrl+c to exit
      </Text>
    </Box>
  );
}

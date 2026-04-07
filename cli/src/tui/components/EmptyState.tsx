import { Text } from "ink";
import { PALETTE } from "../constants.ts";

export function EmptyState() {
  return (
    <Text color={PALETTE.muted}>{"  "}type a message and press enter…</Text>
  );
}

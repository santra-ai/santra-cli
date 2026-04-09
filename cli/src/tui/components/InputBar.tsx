import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { PALETTE } from "../constants.ts";

interface Props {
  value: string;
  busy: boolean;
  isSwarmMode?: boolean;
}

export function InputBar({ value, busy, isSwarmMode }: Props) {
  const [cur, setCur] = useState(true);
  useEffect(() => {
    if (busy) {
      setCur(false);
      return;
    }
    const t = setInterval(() => setCur((p) => !p), 500);
    return () => clearInterval(t);
  }, [busy]);

  const borderColor = busy ? PALETTE.orangeDim : PALETTE.orange;
  const icon = isSwarmMode ? "◈ swarm" : busy ? "◈ " : "◆ ";
  const placeholder = isSwarmMode
    ? "swarm mode — agents + tool calls"
    : "ask anything  ·  prefix /swarm for agent mode";

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      <Text color={busy ? PALETTE.orangeDim : PALETTE.orange} bold>
        {icon}{" "}
      </Text>
      {busy ? (
        <Text color={PALETTE.muted}>thinking…</Text>
      ) : (
        <Text color={value ? PALETTE.white : PALETTE.muted}>
          {value || placeholder}
          {cur ? "▌" : " "}
        </Text>
      )}
    </Box>
  );
}

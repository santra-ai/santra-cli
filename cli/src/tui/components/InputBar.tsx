import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { PALETTE } from "../constants.ts";

interface InputBarProps {
  value: string;
  busy: boolean;
}

export function InputBar({ value, busy }: InputBarProps) {
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (busy) {
      setShowCursor(false);
      return;
    }

    const timer = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [busy]);

  const borderColor = busy ? PALETTE.orangeDim : PALETTE.orange;
  const promptColor = busy ? PALETTE.orangeDim : PALETTE.orange;
  const promptIcon = busy ? "◈ " : "◆ ";
  const cursor = showCursor ? "▌" : " ";
  const textColor = value ? PALETTE.white : PALETTE.muted;
  const textValue = `${value}${cursor}`;
  // return (
  //   <Box>
  //     <Text color={textColor}></Text>
  //   </Box>
  // );
  return (
    <Box borderTop borderColor={borderColor} paddingX={1}>
      <Text color={promptColor} bold>
        {promptIcon}
      </Text>
      {busy ? (
        <Text color={PALETTE.muted}>thinking…</Text>
      ) : (
        <Text color={textColor}>{textValue}</Text>
      )}
    </Box>
  );
}

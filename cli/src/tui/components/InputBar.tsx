import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { PALETTE } from "../constants.ts";

const AGENT_COLOR: Record<string, string> = {
  orchestrator: "#a78bfa",
  thinker: "#60a5fa",
  "file-picker": "#34d399",
  planner: "#fbbf24",
  executor: "#f97316",
  reviewer: "#f472b6",
};

const AGENT_ICON: Record<string, string> = {
  orchestrator: "◎",
  thinker: "◈",
  "file-picker": "◉",
  planner: "◐",
  executor: "◆",
  reviewer: "◑",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
  value: string;
  busy: boolean;
  currentAgent?: string | null;
}

export function InputBar({ value, busy, currentAgent }: Props) {
  const [cur, setCur] = useState(true);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (busy) {
      const t = setInterval(() => {
        setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(t);
    } else {
      const t = setInterval(() => setCur((p) => !p), 500);
      return () => clearInterval(t);
    }
  }, [busy]);

  const agentColor = currentAgent
    ? (AGENT_COLOR[currentAgent] ?? PALETTE.orange)
    : PALETTE.orange;
  const agentIcon = currentAgent ? (AGENT_ICON[currentAgent] ?? "◆") : "◆";

  const borderColor = busy
    ? currentAgent
      ? agentColor
      : PALETTE.orangeDim
    : PALETTE.orange;

  const placeholder =
    "ask santra to inspect, explain, fix, or build  ·  /help  ·  /resume";

  return (
    <Box
      width="100%"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      <Text color={busy ? agentColor : borderColor} bold>
        {busy ? SPINNER_FRAMES[spinnerFrame] : agentIcon}{" "}
      </Text>
      {busy ? (
        <Box gap={1}>
          <Text color={agentColor}>
            {currentAgent ? `[${currentAgent}]` : "thinking"}
          </Text>
          <Text color={PALETTE.muted}>working…</Text>
        </Box>
      ) : (
        <Text color={value ? PALETTE.white : PALETTE.muted}>
          {value || placeholder}
          {cur ? "▌" : " "}
        </Text>
      )}
    </Box>
  );
}

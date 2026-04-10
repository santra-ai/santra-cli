import { Box, Text } from "ink";
import { PALETTE } from "../constants.ts";

const AGENT_COLOR: Record<string, string> = {
  orchestrator: "#a78bfa",
  thinker: "#60a5fa",
  "file-picker": "#34d399",
  planner: "#fbbf24",
  executor: "#f97316",
  reviewer: "#f472b6",
};

interface StreamingMessageProps {
  text: string;
  agentId?: string;
}

export function StreamingMessage({ text, agentId }: StreamingMessageProps) {
  const color = agentId
    ? (AGENT_COLOR[agentId] ?? PALETTE.orange)
    : PALETTE.orange;
  const label = agentId ? `santra [${agentId}]` : "santra";

  // Only show the last ~40 lines of streaming content to avoid flooding the terminal
  const lines = text.split("\n");
  const visibleText = lines.slice(-40).join("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>
        {label}
      </Text>
      <Text color={PALETTE.white} wrap="wrap">
        {"  "}
        {visibleText}
        <Text color={color}>▌</Text>
      </Text>
    </Box>
  );
}

import { Box, Text } from "ink";
import { PALETTE } from "../constants.ts";
import type { ActivityEvent } from "../types.ts";

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

function ac(id: string) {
  return AGENT_COLOR[id] ?? PALETTE.orange;
}
function ai(id: string) {
  return AGENT_ICON[id] ?? "◆";
}

interface Props {
  activity: ActivityEvent[];
  currentAgent: string | null;
}

export function ActivityPanel({ activity, currentAgent }: Props) {
  if (!currentAgent && activity.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={PALETTE.orangeDim}
      paddingX={1}
      marginX={2}
      marginBottom={1}
    >
      {currentAgent && (
        <Box>
          <Text color={ac(currentAgent)} bold>
            {ai(currentAgent)} {currentAgent}
          </Text>
          <Text color={PALETTE.muted}>{"  "}running…</Text>
        </Box>
      )}

      {activity.slice(-6).map((ev, i) => {
        switch (ev.type) {
          case "agent_start":
            return (
              <Box key={i}>
                <Text color={ac(ev.agentId)}>
                  {ai(ev.agentId)} [{ev.agentId}]
                </Text>
                <Text color={PALETTE.muted}>{"  "}started</Text>
              </Box>
            );
          case "agent_done":
            return (
              <Box key={i}>
                <Text color={ac(ev.agentId)}>
                  {ai(ev.agentId)} [{ev.agentId}]
                </Text>
                <Text color="#22c55e">{"  "}✓ done</Text>
              </Box>
            );
          case "tool_call":
            return (
              <Box key={i}>
                <Text color={PALETTE.orange}>⚡ </Text>
                <Text color={PALETTE.white}>{ev.call.name}</Text>
                <Text color={PALETTE.muted}>
                  {"  "}
                  {JSON.stringify(ev.call.parameters).slice(0, 50)}
                  {JSON.stringify(ev.call.parameters).length > 50 ? "…" : ""}
                </Text>
              </Box>
            );
          case "tool_result":
            return (
              <Box key={i}>
                <Text color={ev.result.error ? PALETTE.error : "#22c55e"}>
                  {ev.result.error ? "✗" : "✓"} {ev.result.name}
                </Text>
              </Box>
            );
          case "thinking":
            return (
              <Box key={i}>
                <Text color="#60a5fa">💭 [{ev.agentId}]</Text>
                <Text color={PALETTE.muted}>
                  {"  "}
                  {ev.snippet}…
                </Text>
              </Box>
            );
          default:
            return null;
        }
      })}
    </Box>
  );
}

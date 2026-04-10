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

// Trim a string to a max length, adding ellipsis
function clip(s: string, n: number) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : clean.slice(0, n) + "…";
}

// Extract a human-readable summary from a tool call
function toolCallSummary(
  name: string,
  params: Record<string, unknown>,
): string {
  switch (name) {
    case "read_file":
      return `reading ${params["path"] ?? "file"}`;
    case "write_file":
      return `writing ${params["path"] ?? "file"}`;
    case "list_directory":
      return `listing ${params["path"] ?? "."}`;
    case "search_files":
      return `searching ${params["pattern"] ?? "*"}`;
    default:
      return name;
  }
}

// Extract a human-readable summary from a tool result
function toolResultSummary(
  name: string,
  output: string,
  error?: string,
): string {
  if (error) return clip(error, 60);
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    switch (name) {
      case "read_file": {
        const lines = parsed["lines"] as number | undefined;
        const path = parsed["path"] as string | undefined;
        return `${path ?? "file"} — ${lines ?? "?"} lines`;
      }
      case "write_file": {
        const path = parsed["path"] as string | undefined;
        return `wrote ${path ?? "file"}`;
      }
      case "list_directory": {
        const entries = parsed["entries"] as unknown[] | undefined;
        return `${entries?.length ?? 0} entries`;
      }
      case "search_files": {
        const count = parsed["count"] as number | undefined;
        const pattern = parsed["pattern"] as string | undefined;
        return `${count ?? 0} files matching ${pattern ?? "*"}`;
      }
      default:
        return "done";
    }
  } catch {
    return clip(output, 60);
  }
}

interface Props {
  activity: ActivityEvent[];
  currentAgent: string | null;
  thinkingSnippet: string | null;
}

export function ActivityPanel({
  activity,
  currentAgent,
  thinkingSnippet,
}: Props) {
  // Only show the last 6 activity events to keep the panel tight
  const recent = activity.slice(-6);

  if (!currentAgent && recent.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={PALETTE.orangeDim}
      paddingX={1}
      marginX={2}
      marginBottom={1}
    >
      {/* Current agent status line */}
      {currentAgent && (
        <Box gap={1}>
          <Text color={ac(currentAgent)} bold>
            {ai(currentAgent)} {currentAgent}
          </Text>
          {thinkingSnippet ? (
            <Text color={PALETTE.muted}>{clip(thinkingSnippet, 70)}</Text>
          ) : (
            <Text color={PALETTE.muted}>working…</Text>
          )}
        </Box>
      )}

      {/* Activity log — minimal one-liners only */}
      {recent.map((ev, i) => {
        switch (ev.type) {
          case "agent_start":
            return (
              <Box key={i} gap={1}>
                <Text color={ac(ev.agentId)}>{ai(ev.agentId)}</Text>
                <Text color={PALETTE.muted} dimColor>
                  {ev.agentId}
                </Text>
                <Text color={PALETTE.white} dimColor>
                  {clip(ev.task, 55)}
                </Text>
              </Box>
            );
          case "agent_done":
            return (
              <Box key={i} gap={1}>
                <Text color="#22c55e">✓</Text>
                <Text color={ac(ev.agentId)} dimColor>
                  {ev.agentId}
                </Text>
              </Box>
            );
          case "tool_call":
            return (
              <Box key={i} gap={1}>
                <Text color={PALETTE.orange}>⚡</Text>
                <Text color={PALETTE.white}>
                  {toolCallSummary(
                    ev.call.name,
                    ev.call.parameters as Record<string, unknown>,
                  )}
                </Text>
              </Box>
            );
          case "tool_result":
            return (
              <Box key={i} gap={1}>
                <Text color={ev.result.error ? PALETTE.error : "#22c55e"}>
                  {ev.result.error ? "✗" : "✓"}
                </Text>
                <Text color={PALETTE.muted} dimColor>
                  {toolResultSummary(
                    ev.result.name,
                    ev.result.output,
                    ev.result.error,
                  )}
                </Text>
              </Box>
            );
          case "thinking":
            // Don't show thinking in the log — it's shown in the status line above
            return null;
          default:
            return null;
        }
      })}
    </Box>
  );
}

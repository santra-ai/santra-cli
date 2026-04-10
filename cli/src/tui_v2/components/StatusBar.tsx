import { Box, Text } from "ink";
import type { AgentStats } from "../types";
import { InputBar } from "./InputBar";
import type { SlashCommand } from "./InputBar";

// ─── Stats row ────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function StatsRow({ stats }: { stats: AgentStats }) {
  return (
    <Box gap={3} paddingX={1}>
      <Box gap={1}>
        <Text color="green" dimColor>●</Text>
        <Text color="gray">{stats.model}</Text>
      </Box>
      <Box gap={1}>
        <Text color="gray" dimColor>tokens</Text>
        <Text color="gray">{stats.tokens.toLocaleString()}</Text>
      </Box>
      <Box gap={1}>
        <Text color="gray" dimColor>steps</Text>
        <Text color="gray">{stats.steps}/{stats.totalSteps}</Text>
      </Box>
      <Box gap={1}>
        <Text color="gray" dimColor>elapsed</Text>
        <Text color="gray">{formatElapsed(stats.elapsed)}</Text>
      </Box>
    </Box>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

interface StatusBarProps {
  stats: AgentStats;
  inputValue: string;
  inputBusy: boolean;
  suggestions: SlashCommand[];
  selectedSuggestionIdx: number;
}

export default function StatusBar({
  stats,
  inputValue,
  inputBusy,
  suggestions,
  selectedSuggestionIdx,
}: StatusBarProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="classic"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
    >
      <InputBar
        value={inputValue}
        busy={inputBusy}
        suggestions={suggestions}
        selectedSuggestionIdx={selectedSuggestionIdx}
      />

      <Box
        borderStyle="classic"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
      >
        <StatsRow stats={stats} />
      </Box>
    </Box>
  );
}

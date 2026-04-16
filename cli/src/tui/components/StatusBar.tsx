import { Box, Text } from "ink";
import type { AgentStats } from "../types";
import { InputBar } from "./InputBar";
import type { SlashCommand } from "./InputBar";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function shortModel(model: string): string {
  // "qwen/qwen2.5-coder-32b-instruct" → "qwen2.5-coder-32b"
  const parts = model.split("/");
  const name = parts[parts.length - 1] ?? model;
  // Strip trailing "-instruct", "-chat", etc.
  return name.replace(/-(instruct|chat|preview|latest)$/i, "");
}

function StatsRow({ stats }: { stats: AgentStats }) {
  return (
    <Box paddingX={1} flexDirection="row">
      <Text color="green">● </Text>
      <Text color="gray">{shortModel(stats.model)}</Text>
      <Text color="gray">  ·  </Text>
      <Text color="white">{stats.tokens.toLocaleString()}</Text>
      <Text color="gray"> tokens</Text>
      <Text color="gray">  ·  </Text>
      <Text color="white">{stats.toolCalls}</Text>
      <Text color="gray"> tools</Text>
      <Text color="gray">  ·  </Text>
      <Text color="white">{stats.steps}</Text>
      <Text color="gray">/{stats.totalSteps} steps</Text>
      <Text color="gray">  ·  </Text>
      <Text color="white">{formatElapsed(stats.elapsed)}</Text>
    </Box>
  );
}

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
      borderStyle="single"
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
        borderStyle="single"
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

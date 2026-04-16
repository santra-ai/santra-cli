import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { SlashCommand } from "../../tui/components/InputBar";
import type { AgentStats } from "../../tui/types";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function shortModel(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1] ?? model;
  return name.replace(/-(instruct|chat|preview|latest)$/i, "");
}

interface ComposerProps {
  value: string;
  busy: boolean;
  placeholder: string;
  suggestions: SlashCommand[];
  selectedSuggestionIdx: number;
  stats: AgentStats;
}

function SuggestionsOverlay({
  suggestions,
  selectedSuggestionIdx,
}: Pick<ComposerProps, "suggestions" | "selectedSuggestionIdx">) {
  return (
    <Box
      flexDirection="column"
      marginX={1}
      marginBottom={1}
      borderStyle="round"
      borderColor="gray"
    >
      {suggestions.map((suggestion, index) => {
        const selected = index === selectedSuggestionIdx;
        const prefix = selected ? "› " : "  ";

        return (
          <Box key={`${suggestion.kind}-${suggestion.name}-${index}`} paddingX={1}>
            <Text color={selected ? "cyan" : "gray"} bold={selected}>
              {prefix}
              {suggestion.name}
            </Text>
            <Text color="gray" dimColor>
              {"  "}
              {suggestion.description}
            </Text>
          </Box>
        );
      })}
      <Box paddingX={2}>
        <Text color="gray" dimColor>
          ↑↓ choose  •  tab complete  •  enter run
        </Text>
      </Box>
    </Box>
  );
}

export function Composer({
  value,
  busy,
  placeholder,
  suggestions,
  selectedSuggestionIdx,
  stats,
}: ComposerProps) {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (busy) {
      setCursorVisible(false);
      return;
    }

    const timer = setInterval(() => {
      setCursorVisible((current) => !current);
    }, 450);

    return () => clearInterval(timer);
  }, [busy]);

  const cursor = busy ? "" : cursorVisible ? "▌" : " ";

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
      {suggestions.length > 0 ? (
        <SuggestionsOverlay
          suggestions={suggestions}
          selectedSuggestionIdx={selectedSuggestionIdx}
        />
      ) : null}

      <Box paddingX={1}>
        <Text color={busy ? "cyan" : "#7CFFB2"} bold>
          {busy ? "◈" : "◆"}
        </Text>
        <Text> </Text>
        {busy ? (
          <Text color="gray" dimColor>
            Agent runtime active… Ctrl+C or Esc interrupts the run.
          </Text>
        ) : value ? (
          <Text color="white">{value}{cursor}</Text>
        ) : (
          <Text color="gray" dimColor>
            {placeholder}
            {cursor}
          </Text>
        )}
      </Box>

      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        paddingX={1}
      >
        <Text color="#7CFFB2">● </Text>
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
    </Box>
  );
}

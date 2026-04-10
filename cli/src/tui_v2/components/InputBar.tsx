import { Box, Text } from "ink";
import { useEffect, useState } from "react";

// ── Slash commands ──────────────────────────────────────────────────────────

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/resume", description: "Resume a saved session"  },
  { name: "/clear",  description: "Clear the agent log"     },
  { name: "/stop",   description: "Stop the running agent"  },
  { name: "/model",  description: "Change the AI model"     },
  { name: "/help",   description: "Show available commands" },
];

export function getSlashSuggestions(value: string): SlashCommand[] {
  if (!value.startsWith("/")) return [];
  if (value.includes(" ")) return []; // command name already completed
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(value));
}

// ── Suggestions overlay ─────────────────────────────────────────────────────

interface SuggestionsOverlayProps {
  suggestions: SlashCommand[];
  selectedIdx: number;
}

function SuggestionsOverlay({ suggestions, selectedIdx }: SuggestionsOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      marginX={2}
    >
      {suggestions.map((cmd, i) => {
        const selected = i === selectedIdx;
        return (
          <Box key={cmd.name} gap={2} paddingX={1}>
            <Text color={selected ? "green" : "gray"} bold={selected}>
              {selected ? "›" : " "} {cmd.name.padEnd(10)}
            </Text>
            <Text color="gray" dimColor={!selected}>
              {cmd.description}
            </Text>
          </Box>
        );
      })}
      <Box paddingX={2}>
        <Text color="gray" dimColor>
          ↑↓ navigate  ·  tab complete  ·  enter select  ·  esc dismiss
        </Text>
      </Box>
    </Box>
  );
}

// ── Input bar ───────────────────────────────────────────────────────────────

export interface InputBarProps {
  value: string;
  busy: boolean;
  suggestions: SlashCommand[];
  selectedSuggestionIdx: number;
}

export function InputBar({
  value,
  busy,
  suggestions,
  selectedSuggestionIdx,
}: InputBarProps) {
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (busy) {
      setCursorOn(false);
      return;
    }
    const id = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(id);
  }, [busy]);

  const hasSuggestions = suggestions.length > 0;
  const promptIcon = busy ? "◈" : "◆";
  const promptColor = busy ? "gray" : hasSuggestions ? "cyan" : "green";
  const borderColor = busy ? "gray" : hasSuggestions ? "cyan" : "green";
  const cursor = busy ? "" : cursorOn ? "▌" : " ";

  return (
    <Box flexDirection="column">
      {hasSuggestions && (
        <SuggestionsOverlay
          suggestions={suggestions}
          selectedIdx={selectedSuggestionIdx}
        />
      )}

      <Box paddingX={1} gap={1}>
        <Text color={promptColor} bold>
          {promptIcon}
        </Text>
        {busy ? (
          <Text color="gray" dimColor>
            agent is thinking…
          </Text>
        ) : value ? (
          <Text color="white">{value + cursor}</Text>
        ) : (
          <Text color="green">{cursor}</Text>
        )}
      </Box>
    </Box>
  );
}

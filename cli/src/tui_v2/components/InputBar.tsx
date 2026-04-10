import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { StoredChatSummary } from "../../utils/run-state-storage.ts";

// ── Slash commands ──────────────────────────────────────────────────────────

export interface SlashCommand {
  name: string;
  description: string;
  kind: "command" | "session";
  /** chatId — only present when kind === "session" */
  chatId?: string;
}

const BASE_COMMANDS: SlashCommand[] = [
  { name: "/resume", description: "Resume a saved session", kind: "command" },
  { name: "/clear",  description: "Clear the agent log",    kind: "command" },
  { name: "/stop",   description: "Stop the running agent", kind: "command" },
  { name: "/model",  description: "Change the AI model",    kind: "command" },
  { name: "/help",   description: "Show available commands",kind: "command" },
];

function formatChatId(chatId: string): string {
  // chatId looks like "2024-01-15T10-30-00.000Z" — make it human-friendly
  try {
    const iso = chatId.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/, "$1:$2:$3");
    const d = new Date(iso);
    if (isNaN(d.getTime())) return chatId;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return chatId;
  }
}

export function getSlashSuggestions(
  value: string,
  savedChats: StoredChatSummary[] = [],
): SlashCommand[] {
  if (!value.startsWith("/")) return [];

  // Once a space appears the user is past the command name — show session picker
  // only for the /resume command.
  if (value.startsWith("/resume ") || value === "/resume") {
    const filter = value.startsWith("/resume ")
      ? value.slice("/resume ".length).toLowerCase()
      : "";

    const sessionSuggestions: SlashCommand[] = savedChats
      .filter((c) =>
        !filter ||
        c.chatId.toLowerCase().includes(filter) ||
        c.preview.toLowerCase().includes(filter),
      )
      .slice(0, 8) // cap at 8 entries so the list stays readable
      .map((c) => ({
        name: formatChatId(c.chatId),
        description: c.preview,
        kind: "session",
        chatId: c.chatId,
      }));

    if (sessionSuggestions.length > 0) return sessionSuggestions;

    // No saved chats — fall back to showing the /resume command itself
    return [{ name: "/resume", description: "No saved sessions found", kind: "command" }];
  }

  // Default: filter base commands by prefix, hide /resume sub-commands
  if (value.includes(" ")) return [];
  return BASE_COMMANDS.filter((c) => c.name.startsWith(value));
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
        const label = cmd.kind === "session" ? cmd.name : cmd.name.padEnd(10);
        return (
          <Box key={`${cmd.kind}-${cmd.name}-${i}`} gap={2} paddingX={1}>
            <Text color={selected ? "green" : "gray"} bold={selected}>
              {selected ? "›" : " "} {label}
            </Text>
            <Text color="gray" dimColor={!selected}>
              {cmd.description}
            </Text>
          </Box>
        );
      })}
      <Box paddingX={2}>
        <Text color="gray" dimColor>
          ↑↓ navigate  ·  enter select  ·  esc dismiss
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

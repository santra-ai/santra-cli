import type { StoredChatSummary } from "../utils/run-state-storage.ts";

export interface SlashCommand {
  name: string;
  description: string;
  kind: "command" | "session";
  chatId?: string;
}

const BASE_COMMANDS: SlashCommand[] = [
  { name: "/resume", description: "Resume a saved session", kind: "command" },
  { name: "/clear", description: "Clear the visible transcript", kind: "command" },
  { name: "/copy", description: "Copy the visible transcript", kind: "command" },
  { name: "/stop", description: "Stop the running agent", kind: "command" },
  { name: "/model", description: "Show the current model", kind: "command" },
  { name: "/setup", description: "Configure provider and API key after login", kind: "command" },
  { name: "/login", description: "Open the sign-in link", kind: "command" },
  { name: "/help", description: "Show available commands", kind: "command" },
];


function formatChatId(chatId: string): string {
  try {
    const iso = chatId.replace(
      /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/,
      "$1:$2:$3",
    );
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return chatId;
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

  if (value.startsWith("/resume ") || value === "/resume") {
    const filter = value.startsWith("/resume ")
      ? value.slice("/resume ".length).toLowerCase()
      : "";

    const sessions: SlashCommand[] = savedChats
      .filter((chat) =>
        !filter ||
        chat.chatId.toLowerCase().includes(filter) ||
        chat.preview.toLowerCase().includes(filter),
      )
      .slice(0, 8)
      .map((chat) => ({
        name: formatChatId(chat.chatId),
        description: chat.preview,
        kind: "session",
        chatId: chat.chatId,
      }));

    return sessions.length > 0
      ? sessions
      : [{ name: "/resume", description: "No saved sessions found", kind: "command" }];
  }

  if (value.includes(" ")) return [];
  return BASE_COMMANDS.filter((command) => command.name.startsWith(value));
}

/**
 * Positive-allowlist filter for composer input.
 * Only printable ASCII (0x20 space → 0x7E tilde) passes through.
 * This blocks: control characters, DEL, mouse SGR sequences, and anything
 * outside standard keyboard characters.
 */
export function sanitizeComposerInput(input: string): string {
  if (!input) return "";
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7e) result += input[i];
  }
  return result;
}

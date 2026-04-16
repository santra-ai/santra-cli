import type { LogEntry, Task } from "../tui/types/index.ts";
import type { TranscriptRow, TranscriptSegment } from "../tui_v3/types";

const TIMESTAMP_WIDTH = 8;
const BLANK_TIMESTAMP = " ".repeat(TIMESTAMP_WIDTH);
export const STATUS_TIPS = [
  "Tab completes commands and saved sessions.",
  "Use /resume to continue a previous chat.",
  "Use /clear if you want to wipe the visible transcript.",
  "Use /stop, Esc, or Ctrl+C to interrupt a run.",
  "Use /help to see the available slash commands.",
  "Press Enter to send your draft to the agent.",
  "Use Up, Down, Page Up, and Page Down to move through the log.",
  "You can select and copy text directly from the terminal.",
];

function seg(
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  opts?: Pick<TranscriptSegment, "bold" | "dim" | "italic">,
): TranscriptSegment {
  return { text, tone, ...opts };
}

function makeRow(key: string, after: TranscriptSegment[]): TranscriptRow {
  return {
    key,
    before: [seg(BLANK_TIMESTAMP, "muted"), seg("  ", "muted")],
    after,
  };
}

function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  return `${text.slice(0, maxWidth - 1)}…`;
}

function latestMeaningfulLine(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? text.trim();
}

function deriveActivity(
  busy: boolean,
  log: LogEntry[],
  tasks: Task[],
  inputValue: string,
): string {
  if (busy) {
    const stream = [...log].reverse().find((entry) => entry.level === "stream" && entry.message.trim());
    if (stream) return `I'm streaming a response: ${latestMeaningfulLine(stream.message)}`;

    const bullet = [...log].reverse().find((entry) => entry.level === "bullet" && !entry.done);
    if (bullet) return `I'm working on ${bullet.message.toLowerCase()}`;

    const thinking = [...log].reverse().find((entry) => entry.level === "think" && !entry.finished);
    if (thinking) return `I'm thinking through ${latestMeaningfulLine(thinking.message).toLowerCase()}`;

    const activeTask = tasks.find((task) => task.status === "active");
    if (activeTask) return `I'm ${activeTask.label.toLowerCase()}`;

    const section = [...log].reverse().find((entry) => entry.level === "section" && !entry.finished);
    if (section) return `I'm ${section.message.toLowerCase()}`;

    return "I'm preparing the next update.";
  }

  if (inputValue.startsWith("/")) {
    return "I'm ready to run that command.";
  }

  if (inputValue.trim()) {
    return "I'm ready to send that when you are.";
  }

  return "I'm ready when you are.";
}

export function formatTranscriptStatusRows({
  busy,
  inputValue,
  log,
  tasks,
  tipIndex,
  width,
}: {
  busy: boolean;
  inputValue: string;
  log: LogEntry[];
  tasks: Task[];
  tipIndex: number;
  width: number;
}): TranscriptRow[] {
  const contentWidth = Math.max(24, width - 12);
  const activity = truncate(deriveActivity(busy, log, tasks, inputValue), contentWidth - 8);
  const tip = truncate(
    STATUS_TIPS[((tipIndex % STATUS_TIPS.length) + STATUS_TIPS.length) % STATUS_TIPS.length] ?? "",
    contentWidth - 5,
  );

  return [
    makeRow("status-separator", [seg("·", "muted", { dim: true })]),
    makeRow("status-activity", [
      seg("Agent ", "muted", { dim: true }),
      seg(activity, "muted"),
    ]),
    makeRow("status-tip", [
      seg("Tip: ", "muted", { dim: true }),
      seg(tip, "muted", { dim: true }),
    ]),
  ];
}

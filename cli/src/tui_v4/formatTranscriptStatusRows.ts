import type { LogEntry, Task } from "./types.ts";
import type { TranscriptRow, TranscriptSegment } from "./transcript.ts";

const TIMESTAMP_WIDTH = 8;
const BLANK_TIMESTAMP = " ".repeat(TIMESTAMP_WIDTH);

function seg(
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  opts?: Partial<Pick<TranscriptSegment, "bold" | "dim" | "italic">>,
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

function deriveWorkingLine(
  busy: boolean,
  log: LogEntry[],
  _tasks: Task[],
): string {
  if (!busy) return "";

  const bullet = [...log]
    .reverse()
    .find((e) => e.level === "bullet" && !e.done);
  if (bullet) return `Working: ${bullet.message}`;
  return "";
}

function deriveThinkingLine(
  busy: boolean,
  log: LogEntry[],
  inputValue: string,
): string {
  if (busy) return "";

  if (inputValue.startsWith("/")) return "Ready · press Enter to run command";
  if (inputValue.trim()) return "Ready · press Enter to send";
  return "Ready";
}

export function formatTranscriptStatusRows({
  busy,
  inputValue,
  log,
  tasks,
  width,
}: {
  busy: boolean;
  inputValue: string;
  log: LogEntry[];
  tasks: Task[];
  width: number;
}): TranscriptRow[] {
  const contentWidth = Math.max(24, width - 12);
  const working = truncate(
    deriveWorkingLine(busy, log, tasks),
    contentWidth - 4,
  );
  const thinking = truncate(
    deriveThinkingLine(busy, log, inputValue),
    contentWidth - 4,
  );

  const rows: TranscriptRow[] = [
    makeRow("status-separator", [seg("·", "muted", { dim: true })]),
  ];

  if (working) {
    rows.push(makeRow("status-working", [seg(working)]));
  }

  if (thinking) {
    rows.push(
      makeRow("status-thinking", [seg(thinking, "muted", { dim: true })]),
    );
  }

  return rows;
}

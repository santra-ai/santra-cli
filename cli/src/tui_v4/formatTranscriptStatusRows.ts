import type { LogEntry, Task } from "./types.ts";
import type {
  TranscriptIndicator,
  TranscriptRow,
  TranscriptSegment,
} from "./transcript.ts";

const TIMESTAMP_WIDTH = 8;
const BLANK_TIMESTAMP = " ".repeat(TIMESTAMP_WIDTH);

function seg(
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  opts?: Partial<Pick<TranscriptSegment, "bold" | "dim" | "italic">>,
): TranscriptSegment {
  return { text, tone, ...opts };
}

function spinnerIndicator(color: string): TranscriptIndicator {
  return { kind: "spinner", color };
}

function iconIndicator(
  text: string,
  color: string,
  opts?: { bold?: boolean; dim?: boolean },
): TranscriptIndicator {
  return { kind: "icon", text, color, ...opts };
}

function makeRow(
  key: string,
  after: TranscriptSegment[],
  indicator?: TranscriptIndicator,
): TranscriptRow {
  return {
    key,
    before: [seg(BLANK_TIMESTAMP, "muted"), seg("  ", "muted")],
    indicator,
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

function derivePhaseLine(
  busy: boolean,
  log: LogEntry[],
): string {
  if (!busy) return "";

  const section = [...log]
    .reverse()
    .find((entry) => entry.level === "section" && !entry.finished);
  if (section?.message?.trim()) {
    return `Phase: ${section.message.trim()}`;
  }

  return "";
}

function deriveStepLine(
  busy: boolean,
  log: LogEntry[],
): string {
  if (!busy) return "";

  const status = [...log]
    .reverse()
    .find((entry) => entry.level === "status");
  if (status?.message?.trim()) {
    return `Now: ${status.message.trim()}`;
  }

  const model = [...log]
    .reverse()
    .find((entry) => entry.level === "model");
  if (!model) return "";

  const title = model.title ? `${model.title} · ` : "";
  return `Step: ${title}${model.message}`;
}

function deriveThinkingLine(
  busy: boolean,
  log: LogEntry[],
  inputValue: string,
): string {
  if (busy) {
    const think = [...log]
      .reverse()
      .find((entry) => entry.level === "think");
    if (think?.message?.trim()) {
      return `Thinking: ${think.message.trim()}`;
    }
    return "";
  }

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
  const phase = truncate(
    derivePhaseLine(busy, log),
    contentWidth - 4,
  );
  const working = truncate(
    deriveWorkingLine(busy, log, tasks),
    contentWidth - 4,
  );
  const step = truncate(
    deriveStepLine(busy, log),
    contentWidth - 4,
  );
  const thinking = truncate(
    deriveThinkingLine(busy, log, inputValue),
    contentWidth - 4,
  );

  const rows: TranscriptRow[] = [
    makeRow("status-separator", [seg("·", "muted", { dim: true })]),
  ];

  if (phase) {
    rows.push(
      makeRow(
        "status-phase",
        [seg(phase, "heading", { bold: true })],
        busy ? spinnerIndicator("cyan") : iconIndicator("✓", "green", { bold: true }),
      ),
    );
  }

  if (step) {
    rows.push(
      makeRow(
        "status-step",
        [seg(step, "warning", { bold: true })],
        busy ? spinnerIndicator("yellow") : iconIndicator("·", "yellow"),
      ),
    );
  }

  if (working) {
    rows.push(
      makeRow(
        "status-working",
        [seg(working)],
        busy ? spinnerIndicator("cyan") : iconIndicator("·", "gray", { dim: true }),
      ),
    );
  }

  if (thinking) {
    rows.push(
      makeRow(
        "status-thinking",
        [seg(thinking, "muted", { dim: true })],
        busy ? spinnerIndicator("gray") : iconIndicator("·", "gray", { dim: true }),
      ),
    );
  }

  return rows;
}

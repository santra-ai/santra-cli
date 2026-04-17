import type {
  MockTranscriptItem,
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

function makeRow(
  key: string,
  before: TranscriptSegment[],
  after: TranscriptSegment[],
  indicator?: TranscriptIndicator,
): TranscriptRow {
  return { key, before, indicator, after };
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

// ---------------------------------------------------------------------------
// Inline markdown: parse **bold** and `code` spans into segments
// ---------------------------------------------------------------------------

function parseInline(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Pattern matches **bold** and `code`
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(seg(text.slice(lastIndex, match.index)));
    }

    if (match[0].startsWith("**")) {
      segments.push(seg(match[2] ?? "", "default", { bold: true }));
    } else {
      segments.push(seg(match[3] ?? "", "code"));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(seg(text.slice(lastIndex)));
  }

  return segments.length > 0 ? segments : [seg(text)];
}

// ---------------------------------------------------------------------------
// Word-wrap a flat string to a given column width, returning lines
// ---------------------------------------------------------------------------

function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [""];
  const safeWidth = Math.max(8, maxWidth);
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const para of paragraphs) {
    if (para.length <= safeWidth) {
      lines.push(para);
      continue;
    }

    const words = para.split(" ");
    let current = "";

    for (const word of words) {
      if (!word) {
        current += " ";
        continue;
      }

      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= safeWidth) {
        current += ` ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [""];
}

// ---------------------------------------------------------------------------
// Continuation prefix used for multi-line items (blank timestamp + indent)
// ---------------------------------------------------------------------------

const CONTINUATION_BEFORE = [seg(BLANK_TIMESTAMP, "muted"), seg("   ", "muted")];

// ---------------------------------------------------------------------------
// Per-item renderers
// ---------------------------------------------------------------------------

function renderUser(item: Extract<MockTranscriptItem, { kind: "user" }>, width: number): TranscriptRow[] {
  const prefixWidth = TIMESTAMP_WIDTH + 5; // timestamp + "  › "
  const contentWidth = Math.max(8, width - prefixWidth);
  const lines = wrapText(item.prompt, contentWidth);

  const rows: TranscriptRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === 0) {
      rows.push(
        makeRow(
          `${item.id}:0`,
          [seg(item.timestamp, "muted"), seg("  › ", "accent")],
          parseInline(line).map((s) => ({ ...s, bold: true })),
        ),
      );
    } else {
      rows.push(
        makeRow(`${item.id}:${i}`, CONTINUATION_BEFORE, parseInline(line).map((s) => ({ ...s, bold: true }))),
      );
    }
  }

  return rows;
}

function renderDivider(item: Extract<MockTranscriptItem, { kind: "divider" }>, width: number): TranscriptRow[] {
  const label = ` ${item.label} `;
  const dashCount = Math.max(0, width - label.length - 4);
  const leftDashes = "── ";
  const rightDashes = " " + "─".repeat(dashCount);
  const text = leftDashes + label + rightDashes;

  return [
    makeRow(item.id, [], [seg(text, "muted", { dim: true })]),
  ];
}

function renderPhase(item: Extract<MockTranscriptItem, { kind: "phase" }>, _width: number): TranscriptRow[] {
  const active = item.status === "active";
  const indicator = active
    ? spinnerIndicator("cyan")
    : iconIndicator("✓", "green", { bold: true });
  const titleTone: TranscriptSegment["tone"] = active ? "default" : "muted";

  return [
    makeRow(
      item.id,
      [seg(item.timestamp, "muted"), seg("  ", "muted")],
      [seg(" ", "muted"), seg(item.title, titleTone, { bold: active })],
      indicator,
    ),
  ];
}

function renderThinking(item: Extract<MockTranscriptItem, { kind: "thinking" }>, width: number): TranscriptRow[] {
  const active = item.status === "active";
  // prefix: timestamp(8) + "  │  "(5) = 13 chars used
  const contentWidth = Math.max(8, width - 13);
  const contentLines = wrapText(item.content, contentWidth);

  const rows: TranscriptRow[] = [];

  // Top border row with label
  const topIndicator = active
    ? spinnerIndicator("cyan")
    : iconIndicator("●", "gray", { dim: true });

  rows.push(
    makeRow(
      `${item.id}:header`,
      [seg(item.timestamp, "muted"), seg("  ┌─ ", "muted", { dim: true })],
      [seg(" ", "muted"), seg(item.label, active ? "muted" : "muted", { italic: true, dim: true })],
      topIndicator,
    ),
  );

  // Content lines
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i] ?? "";
    rows.push(
      makeRow(
        `${item.id}:line:${i}`,
        [seg(BLANK_TIMESTAMP, "muted"), seg("  │  ", "muted", { dim: true })],
        [seg(line, "muted", { dim: true })],
      ),
    );
  }

  // Bottom border (only when done)
  if (!active) {
    rows.push(
      makeRow(
        `${item.id}:footer`,
        [seg(BLANK_TIMESTAMP, "muted"), seg("  └──", "muted", { dim: true })],
        [],
      ),
    );
  }

  return rows;
}

function renderTool(item: Extract<MockTranscriptItem, { kind: "tool" }>, width: number): TranscriptRow[] {
  const active = item.status === "active";
  const indicator = active
    ? spinnerIndicator("cyan")
    : iconIndicator("✓", "green");
  const titleTone: TranscriptSegment["tone"] = active ? "default" : "muted";

  const rows: TranscriptRow[] = [
    makeRow(
      `${item.id}:title`,
      [seg(item.timestamp, "muted"), seg("  ", "muted")],
      [seg(" ", "muted"), seg(item.title, titleTone)],
      indicator,
    ),
  ];

  // Detail line (shown when done and detail exists)
  if (!active && item.detail) {
    const prefixWidth = TIMESTAMP_WIDTH + 7; // "  ⎿ " + spacing
    const detailWidth = Math.max(8, width - prefixWidth);
    const detailLines = wrapText(item.detail, detailWidth);

    for (let i = 0; i < detailLines.length; i++) {
      const line = detailLines[i] ?? "";
      rows.push(
        makeRow(
          `${item.id}:detail:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg("  ⎿  ", "muted", { dim: true })],
          [seg(line, "muted", { dim: true })],
        ),
      );
    }
  }

  return rows;
}

function renderResponse(item: Extract<MockTranscriptItem, { kind: "response" }>, width: number): TranscriptRow[] {
  const active = item.status === "active";
  const prefixWidth = TIMESTAMP_WIDTH + 4; // "  ✓ " or spinner
  const contentWidth = Math.max(8, width - prefixWidth);

  const indicator = active
    ? spinnerIndicator("green")
    : iconIndicator("✓", "green", { bold: true });

  const rows: TranscriptRow[] = [];
  const contentLines = item.content.split("\n");

  for (let i = 0; i < contentLines.length; i++) {
    const rawLine = contentLines[i] ?? "";
    const wrapped = wrapText(rawLine, contentWidth);

    for (let j = 0; j < wrapped.length; j++) {
      const line = wrapped[j] ?? "";
      const isFirst = i === 0 && j === 0;
      const key = `${item.id}:${i}:${j}`;

      // Render markdown headings, bullets, code blocks
      const rendered = renderMarkdownLine(line);

      if (isFirst) {
        rows.push(
          makeRow(
            key,
            [seg(item.timestamp, "muted"), seg("  ", "muted")],
            [seg(" ", "muted"), ...rendered],
            indicator,
          ),
        );
      } else {
        rows.push(
          makeRow(key, CONTINUATION_BEFORE, rendered),
        );
      }
    }
  }

  if (rows.length === 0) {
    rows.push(
      makeRow(
        `${item.id}:empty`,
        [seg(item.timestamp, "muted"), seg("  ", "muted")],
        [],
        indicator,
      ),
    );
  }

  return rows;
}

function renderMarkdownLine(line: string): TranscriptSegment[] {
  // Heading
  const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
  if (headingMatch) {
    return [seg(headingMatch[2] ?? "", "default", { bold: true })];
  }

  // Bullet
  const bulletMatch = /^[•\-\*]\s+(.+)$/.exec(line);
  if (bulletMatch) {
    return [seg("• ", "muted"), ...parseInline(bulletMatch[1] ?? "")];
  }

  // Numbered list
  const numberedMatch = /^(\d+)\.\s+(.+)$/.exec(line);
  if (numberedMatch) {
    return [
      seg(`${numberedMatch[1]}. `, "muted"),
      ...parseInline(numberedMatch[2] ?? ""),
    ];
  }

  // Check marks
  if (line.startsWith("✓ ") || line.startsWith("- [x] ")) {
    const text = line.replace(/^(✓ |- \[x\] )/, "");
    return [seg("✓ ", "success"), ...parseInline(text)];
  }

  // Empty line
  if (line.trim() === "") {
    return [seg("")];
  }

  return parseInline(line);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function formatMockTranscriptRows(
  transcript: MockTranscriptItem[],
  width: number,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];

  for (const item of transcript) {
    switch (item.kind) {
      case "user":
        rows.push(...renderUser(item, width));
        break;
      case "divider":
        rows.push(...renderDivider(item, width));
        break;
      case "phase":
        rows.push(...renderPhase(item, width));
        break;
      case "thinking":
        rows.push(...renderThinking(item, width));
        break;
      case "tool":
        rows.push(...renderTool(item, width));
        break;
      case "response":
        rows.push(...renderResponse(item, width));
        break;
    }
  }

  return rows;
}

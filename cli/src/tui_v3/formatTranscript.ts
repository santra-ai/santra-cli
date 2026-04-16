import type { DiffEntry, LogEntry } from "../tui/types";
import type {
  TranscriptIndicator,
  TranscriptRow,
  TranscriptSegment,
} from "./types";

const TIMESTAMP_WIDTH = 8;
const BLANK_TIMESTAMP = " ".repeat(TIMESTAMP_WIDTH);
const MAX_DIFF_LINES = 40;

interface InlineSeg {
  text: string;
  tone?: TranscriptSegment["tone"];
  bold?: boolean;
}

type MarkdownLine =
  | { type: "blank" }
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; num: string; text: string }
  | { type: "code"; text: string }
  | { type: "prose"; text: string }
  | { type: "check"; text: string }
  | { type: "cross"; text: string };

function seg(
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  options?: Pick<TranscriptSegment, "bold" | "dim" | "italic">,
): TranscriptSegment {
  return {
    text,
    tone,
    ...options,
  };
}

function row(
  key: string,
  before: TranscriptSegment[],
  after: TranscriptSegment[],
  indicator?: TranscriptIndicator,
): TranscriptRow {
  return { key, before, indicator, after };
}

function measureSegments(segments: TranscriptSegment[]): number {
  return segments.reduce((total, segment) => total + segment.text.length, 0);
}

function measureIndicator(indicator?: TranscriptIndicator): number {
  if (!indicator) {
    return 0;
  }
  if (indicator.kind === "spinner") {
    return 1;
  }
  return indicator.text.length;
}

function tokenizeSegments(segments: InlineSeg[]): InlineSeg[] {
  const tokens: InlineSeg[] = [];
  for (const segment of segments) {
    const parts = segment.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) {
        continue;
      }
      tokens.push({
        ...segment,
        text: part,
      });
    }
  }
  return tokens;
}

function wrapInlineSegments(
  segments: InlineSeg[],
  firstWidth: number,
  continuationWidth: number,
): InlineSeg[][] {
  const widths = [Math.max(8, firstWidth), Math.max(8, continuationWidth)];
  const lines: InlineSeg[][] = [];
  const tokens = tokenizeSegments(segments);

  let currentLine: InlineSeg[] = [];
  let currentLength = 0;
  let widthIndex = 0;

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
    currentLength = 0;
    widthIndex = 1;
  };

  for (const token of tokens) {
    const isWhitespace = /^\s+$/.test(token.text);
    if (isWhitespace && currentLength === 0) {
      continue;
    }

    let remaining = token.text;
    while (remaining.length > 0) {
      const currentWidth = widths[widthIndex] ?? widths[1]!;
      const available = currentWidth - currentLength;

      if (available <= 0) {
        pushLine();
        continue;
      }

      if (remaining.length <= available) {
        currentLine.push({ ...token, text: remaining });
        currentLength += remaining.length;
        remaining = "";
        continue;
      }

      if (isWhitespace) {
        pushLine();
        remaining = remaining.trimStart();
        continue;
      }

      if (currentLength > 0) {
        pushLine();
        continue;
      }

      const chunk = remaining.slice(0, currentWidth);
      currentLine.push({ ...token, text: chunk });
      currentLength += chunk.length;
      remaining = remaining.slice(chunk.length);
      pushLine();
    }
  }

  if (currentLine.length > 0 || lines.length === 0) {
    lines.push(currentLine);
  }

  return lines;
}

function convertInlineToSegments(segments: InlineSeg[]): TranscriptSegment[] {
  return segments.map((segment) => ({
    text: segment.text,
    tone: segment.tone ?? "default",
    bold: segment.bold,
  }));
}

function parseInline(
  text: string,
  defaultTone: TranscriptSegment["tone"] = "default",
): InlineSeg[] {
  const segments: InlineSeg[] = [];
  let rest = text;

  while (rest.length > 0) {
    const boldIndex = rest.indexOf("**");
    const codeIndex = rest.indexOf("`");
    const nextIndex = Math.min(
      boldIndex < 0 ? Number.POSITIVE_INFINITY : boldIndex,
      codeIndex < 0 ? Number.POSITIVE_INFINITY : codeIndex,
    );

    if (!Number.isFinite(nextIndex)) {
      if (rest) {
        segments.push({ text: rest, tone: defaultTone });
      }
      break;
    }

    if (nextIndex > 0) {
      segments.push({ text: rest.slice(0, nextIndex), tone: defaultTone });
      rest = rest.slice(nextIndex);
    }

    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end < 0) {
        segments.push({ text: rest, tone: defaultTone });
        break;
      }
      segments.push({
        text: rest.slice(2, end),
        tone: defaultTone,
        bold: true,
      });
      rest = rest.slice(end + 2);
      continue;
    }

    const end = rest.indexOf("`", 1);
    if (end < 0) {
      segments.push({ text: rest, tone: defaultTone });
      break;
    }
    segments.push({
      text: rest.slice(1, end),
      tone: "code",
    });
    rest = rest.slice(end + 1);
  }

  return segments;
}

function preprocessMarkdown(text: string): MarkdownLine[] {
  const rawLines = text.split("\n");
  const lines: MarkdownLine[] = [];
  let inCode = false;

  for (const rawLine of rawLines) {
    if (rawLine.startsWith("```")) {
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      lines.push({ type: "code", text: rawLine });
      continue;
    }

    if (!rawLine.trim()) {
      lines.push({ type: "blank" });
      continue;
    }

    const heading = rawLine.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      lines.push({ type: "heading", text: heading[1]! });
      continue;
    }

    const numbered = rawLine.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      lines.push({ type: "numbered", num: numbered[1]!, text: numbered[2]! });
      continue;
    }

    if (/^[*-]\s+/.test(rawLine) || rawLine.startsWith("• ")) {
      lines.push({ type: "bullet", text: rawLine.replace(/^[•*-]\s+/, "") });
      continue;
    }

    if (rawLine.startsWith("✓")) {
      lines.push({ type: "check", text: rawLine.slice(1).trim() });
      continue;
    }

    if (rawLine.startsWith("✗")) {
      lines.push({ type: "cross", text: rawLine.slice(1).trim() });
      continue;
    }

    lines.push({ type: "prose", text: rawLine });
  }

  return lines;
}

function createWrappedRows(options: {
  keyBase: string;
  width: number;
  contentSegments: InlineSeg[];
  firstBefore: TranscriptSegment[];
  firstIndicator?: TranscriptIndicator;
  firstAfterPrefix?: TranscriptSegment[];
  continuationBefore: TranscriptSegment[];
  continuationAfterPrefix?: TranscriptSegment[];
}): TranscriptRow[] {
  const firstPrefixLength =
    measureSegments(options.firstBefore) +
    measureIndicator(options.firstIndicator) +
    measureSegments(options.firstAfterPrefix ?? []);
  const continuationPrefixLength =
    measureSegments(options.continuationBefore) +
    measureSegments(options.continuationAfterPrefix ?? []);

  const lines = wrapInlineSegments(
    options.contentSegments,
    options.width - firstPrefixLength,
    options.width - continuationPrefixLength,
  );

  return lines.map((line, index) => {
    if (index === 0) {
      return row(
        `${options.keyBase}-${index}`,
        options.firstBefore,
        [...(options.firstAfterPrefix ?? []), ...convertInlineToSegments(line)],
        options.firstIndicator,
      );
    }

    return row(
      `${options.keyBase}-${index}`,
      options.continuationBefore,
      [
        ...(options.continuationAfterPrefix ?? []),
        ...convertInlineToSegments(line),
      ],
    );
  });
}

function makeTimestamp(value?: string): TranscriptSegment[] {
  return [
    seg((value ?? BLANK_TIMESTAMP).padEnd(TIMESTAMP_WIDTH), "muted", { dim: true }),
    seg("  ", "muted", { dim: true }),
  ];
}

function formatUserRows(entry: LogEntry, width: number): TranscriptRow[] {
  return createWrappedRows({
    keyBase: entry.id,
    width,
    contentSegments: parseInline(entry.message, "accent"),
    firstBefore: makeTimestamp(entry.time),
    firstIndicator: { kind: "icon", text: "●", color: "#ffb36b" },
    firstAfterPrefix: [seg(" ", "accent")],
    continuationBefore: [...makeTimestamp(), seg("│ ", "accent", { bold: true })],
  });
}

function formatSectionRows(entry: LogEntry, width: number): TranscriptRow[] {
  return createWrappedRows({
    keyBase: entry.id,
    width,
    contentSegments: [{ text: entry.message, tone: "default", bold: true }],
    firstBefore: makeTimestamp(entry.time),
    firstIndicator:
      entry.finished
        ? { kind: "icon", text: "✓", color: "green", bold: true }
        : { kind: "spinner", color: "cyan" },
    firstAfterPrefix: [seg(" ")],
    continuationBefore: makeTimestamp(),
  });
}

function formatThinkingRows(entry: LogEntry, width: number): TranscriptRow[] {
  const rows: TranscriptRow[] = [
    row(
      `${entry.id}-label`,
      makeTimestamp(entry.time),
      [seg(" "), seg(entry.finished ? "thought" : "thinking…", "muted", { italic: true, dim: true })],
      entry.finished
        ? { kind: "icon", text: "∴", color: "gray", dim: true }
        : { kind: "spinner", color: "gray" },
    ),
  ];

  const boxBefore = [...makeTimestamp(), seg("   ", "muted", { dim: true })];
  const innerWidth = Math.max(14, width - measureSegments(boxBefore) - 4);
  const wrappedLines = wrapInlineSegments(
    parseInline(entry.message, "muted"),
    innerWidth,
    innerWidth,
  );

  rows.push(
    row(
      `${entry.id}-top`,
      boxBefore,
      [seg(`╭${"─".repeat(innerWidth + 2)}╮`, "muted", { dim: true })],
    ),
  );

  wrappedLines.forEach((line, index) => {
    const renderedLine = convertInlineToSegments(line);
    const padding = Math.max(0, innerWidth - measureSegments(renderedLine));
    rows.push(
      row(
        `${entry.id}-body-${index}`,
        boxBefore,
        [
          seg("│ ", "muted", { dim: true }),
          ...renderedLine,
          seg(" ".repeat(padding), "muted", { dim: true }),
          seg(" │", "muted", { dim: true }),
        ],
      ),
    );
  });

  rows.push(
    row(
      `${entry.id}-bottom`,
      boxBefore,
      [seg(`╰${"─".repeat(innerWidth + 2)}╯`, "muted", { dim: true })],
    ),
  );

  return rows;
}

function formatBulletRows(entry: LogEntry, width: number): TranscriptRow[] {
  const rows = createWrappedRows({
    keyBase: entry.id,
    width,
    contentSegments: parseInline(entry.message),
    firstBefore: makeTimestamp(entry.time),
    firstIndicator:
      entry.done
        ? { kind: "icon", text: "•", color: "gray", dim: true }
        : { kind: "spinner", color: "cyan" },
    firstAfterPrefix: [seg(" ")],
    continuationBefore: makeTimestamp(),
  });

  if (entry.detail) {
    entry.detail.split("\n").forEach((detailLine, index) => {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-detail-${index}`,
          width,
          contentSegments: parseInline(detailLine || " ", "muted"),
          firstBefore: [...makeTimestamp(), seg("↳ ", "muted", { dim: true })],
          continuationBefore: [...makeTimestamp(), seg("  ", "muted", { dim: true })],
        }),
      );
    });
  }

  return rows;
}

function formatDiffLineRows(
  diff: DiffEntry,
  width: number,
  keyBase: string,
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const before = [...makeTimestamp(), seg("   ", "muted", { dim: true })];
  const innerWidth = Math.max(20, width - measureSegments(before) - 4);
  const visibleLines = diff.lines.slice(0, MAX_DIFF_LINES);

  rows.push(
    row(
      `${keyBase}-top`,
      before,
      [seg(`╭${"─".repeat(innerWidth + 2)}╮`, "muted", { dim: true })],
    ),
  );

  visibleLines.forEach((line, index) => {
    let tone: TranscriptSegment["tone"] = "muted";
    let prefix = " ";
    let lineNo = String(line.lineNo).padStart(4);

    if (line.lineNo === -1) {
      tone = "warning";
      prefix = "@";
      lineNo = " @@";
    } else if (line.type === "add") {
      tone = "success";
      prefix = "+";
    } else if (line.type === "remove") {
      tone = "danger";
      prefix = "-";
    }

    const content = line.lineNo === -1
      ? `${line.content} @@`
      : `${lineNo} ${prefix} ${line.content}`;
    const wrapped = wrapInlineSegments(
      [{ text: content, tone }],
      innerWidth,
      innerWidth,
    );

    wrapped.forEach((wrappedLine, wrappedIndex) => {
      const rendered = convertInlineToSegments(wrappedLine);
      const padding = Math.max(0, innerWidth - measureSegments(rendered));
      rows.push(
        row(
          `${keyBase}-body-${index}-${wrappedIndex}`,
          before,
          [
            seg("│ ", "muted", { dim: true }),
            ...rendered,
            seg(" ".repeat(padding), "muted", { dim: true }),
            seg(" │", "muted", { dim: true }),
          ],
        ),
      );
    });
  });

  if (diff.lines.length > MAX_DIFF_LINES) {
    const hiddenCount = diff.lines.length - MAX_DIFF_LINES;
    const rendered = convertInlineToSegments([
      { text: `… ${hiddenCount} more line${hiddenCount === 1 ? "" : "s"} hidden`, tone: "muted" },
    ]);
    const padding = Math.max(0, innerWidth - measureSegments(rendered));
    rows.push(
      row(
        `${keyBase}-truncated`,
        before,
        [
          seg("│ ", "muted", { dim: true }),
          ...rendered,
          seg(" ".repeat(padding), "muted", { dim: true }),
          seg(" │", "muted", { dim: true }),
        ],
      ),
    );
  }

  rows.push(
    row(
      `${keyBase}-bottom`,
      before,
      [seg(`╰${"─".repeat(innerWidth + 2)}╯`, "muted", { dim: true })],
    ),
  );

  return rows;
}

function formatDiffRows(entry: LogEntry, width: number): TranscriptRow[] {
  const diff = entry.diff;
  if (!diff) {
    return [];
  }

  const diffSummary =
    `${diff.added > 0 ? ` +${diff.added}` : ""}${diff.removed > 0 ? ` -${diff.removed}` : ""}`.trim();

  const headerRows = createWrappedRows({
    keyBase: entry.id,
    width,
    contentSegments: [
      { text: entry.message, tone: "warning", bold: true },
      ...(diffSummary ? [{ text: `  ${diffSummary}`, tone: "muted" as const }] : []),
    ],
    firstBefore: makeTimestamp(entry.time),
    firstIndicator: { kind: "icon", text: "✎", color: "yellow", bold: true },
    firstAfterPrefix: [seg(" ")],
    continuationBefore: makeTimestamp(),
  });

  return [...headerRows, ...formatDiffLineRows(diff, width, entry.id)];
}

function formatResponseRows(entry: LogEntry, width: number): TranscriptRow[] {
  const rows: TranscriptRow[] = [
    row(
      `${entry.id}-label`,
      makeTimestamp(entry.time),
      [seg(" "), seg(entry.level === "stream" ? "stream" : "answer", "success", { bold: true })],
      entry.level === "stream"
        ? { kind: "spinner", color: "green" }
        : { kind: "icon", text: "✓", color: "green", bold: true },
    ),
  ];

  const markdownLines = preprocessMarkdown(entry.message);
  const before = [...makeTimestamp(), seg("⎿  ", "muted", { dim: true })];

  markdownLines.forEach((line, lineIndex) => {
    if (line.type === "blank") {
      rows.push(row(`${entry.id}-blank-${lineIndex}`, before, []));
      return;
    }

    if (line.type === "heading") {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-heading-${lineIndex}`,
          width,
          contentSegments: [{ text: line.text, tone: "default", bold: true }],
          firstBefore: before,
          continuationBefore: before,
        }),
      );
      return;
    }

    if (line.type === "bullet") {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-bullet-${lineIndex}`,
          width,
          contentSegments: parseInline(line.text),
          firstBefore: before,
          firstAfterPrefix: [seg("• ", "muted")],
          continuationBefore: before,
          continuationAfterPrefix: [seg("  ", "muted")],
        }),
      );
      return;
    }

    if (line.type === "numbered") {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-numbered-${lineIndex}`,
          width,
          contentSegments: parseInline(line.text),
          firstBefore: before,
          firstAfterPrefix: [seg(`${line.num}. `, "muted")],
          continuationBefore: before,
          continuationAfterPrefix: [seg("   ", "muted")],
        }),
      );
      return;
    }

    if (line.type === "code") {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-code-${lineIndex}`,
          width,
          contentSegments: [{ text: line.text || " ", tone: "code" }],
          firstBefore: before,
          continuationBefore: before,
        }),
      );
      return;
    }

    if (line.type === "check" || line.type === "cross") {
      rows.push(
        ...createWrappedRows({
          keyBase: `${entry.id}-${line.type}-${lineIndex}`,
          width,
          contentSegments: parseInline(
            line.text,
            line.type === "check" ? "default" : "danger",
          ),
          firstBefore: before,
          firstAfterPrefix: [
            seg(`${line.type === "check" ? "✓" : "✗"} `, line.type === "check" ? "success" : "danger"),
          ],
          continuationBefore: before,
          continuationAfterPrefix: [seg("  ", "muted")],
        }),
      );
      return;
    }

    rows.push(
      ...createWrappedRows({
        keyBase: `${entry.id}-prose-${lineIndex}`,
        width,
        contentSegments: parseInline(line.text, entry.level === "stream" ? "default" : "default"),
        firstBefore: before,
        continuationBefore: before,
      }),
    );
  });

  return rows;
}

function formatInfoRows(
  entry: LogEntry,
  width: number,
  icon: string,
  tone: TranscriptSegment["tone"],
  bold = false,
): TranscriptRow[] {
  return createWrappedRows({
    keyBase: entry.id,
    width,
    contentSegments: parseInline(entry.message, tone === "muted" ? "muted" : tone),
    firstBefore: makeTimestamp(entry.time),
    firstIndicator: { kind: "icon", text: icon, color: tone === "danger" ? "red" : tone === "success" ? "green" : "gray", bold },
    firstAfterPrefix: [seg(" ")],
    continuationBefore: makeTimestamp(),
  });
}

export function formatTranscriptRows(
  entries: LogEntry[],
  width: number,
): TranscriptRow[] {
  const safeWidth = Math.max(40, width);
  const rows: TranscriptRow[] = [];

  for (const entry of entries) {
    switch (entry.level) {
      case "user":
        rows.push(...formatUserRows(entry, safeWidth));
        break;
      case "section":
        rows.push(...formatSectionRows(entry, safeWidth));
        break;
      case "bullet":
        rows.push(...formatBulletRows(entry, safeWidth));
        break;
      case "think":
        rows.push(...formatThinkingRows(entry, safeWidth));
        break;
      case "diff":
        rows.push(...formatDiffRows(entry, safeWidth));
        break;
      case "stream":
      case "response":
        rows.push(...formatResponseRows(entry, safeWidth));
        break;
      case "ok":
        rows.push(...formatInfoRows(entry, safeWidth, "✓", "success", true));
        break;
      case "error":
        rows.push(...formatInfoRows(entry, safeWidth, "✗", "danger", true));
        break;
      case "info":
      default:
        rows.push(...formatInfoRows(entry, safeWidth, "◆", "muted"));
        break;
    }
  }

  return rows;
}

export function flattenRowText(item: TranscriptRow): string {
  const indicatorText =
    item.indicator?.kind === "spinner"
      ? "…"
      : item.indicator?.text ?? "";

  return [
    ...item.before.map((segment) => segment.text),
    indicatorText,
    ...item.after.map((segment) => segment.text),
  ].join("");
}

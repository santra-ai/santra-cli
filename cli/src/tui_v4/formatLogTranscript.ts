/**
 * Converts real LogEntry[] (from useAgent / LogDeriver) into TranscriptRow[]
 * for rendering in the TUI v4 visual shell.
 *
 * The visual style mirrors formatMockTranscript.ts exactly — only the input
 * type differs (LogEntry vs MockTranscriptItem).
 */
import type { DiffEntry, LogEntry } from "./types.ts";
import type { TranscriptIndicator, TranscriptRow, TranscriptSegment } from "./transcript.ts";

const TIMESTAMP_WIDTH = 8;
const BLANK_TIMESTAMP = " ".repeat(TIMESTAMP_WIDTH);
const DIFF_CONTEXT = 2;   // context lines shown either side of a change
const MAX_DIFF_SLOTS = 12; // max rendered lines per diff block (excl. header)
const FORMATTER_CACHE_LIMIT = 2000;

function getCached<K, V>(cache: Map<K, V>, key: K, build: () => V): V {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const value = build();
  cache.set(key, value);
  if (cache.size > FORMATTER_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Primitive builders
// ---------------------------------------------------------------------------

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

function makeSpacerRow(key: string): TranscriptRow {
  return {
    key,
    before: [seg(BLANK_TIMESTAMP, "muted")],
    after: [seg(" ")],
  };
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
// Inline markdown and token highlighting
// ---------------------------------------------------------------------------

const SPECIAL_TOKEN_PATTERN =
  /(?:\.{0,2}\/)?(?:[\w@-]+\/)+[\w@./-]+(?::\d+)?|\/[a-z][\w-]*\b|\b[\w@.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|py|go|rs|java|kt|swift|css|scss|html|xml|ya?ml|toml|sh|zsh|txt)\b(?::\d+)?/g;
const parseInlineCache = new Map<string, TranscriptSegment[]>();
const wrapTextCache = new Map<string, string[]>();
const renderMarkdownLineCache = new Map<string, TranscriptSegment[]>();

function pushHighlightedText(
  segments: TranscriptSegment[],
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  opts?: Pick<TranscriptSegment, "bold" | "dim" | "italic">,
): void {
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  for (SPECIAL_TOKEN_PATTERN.lastIndex = 0; (match = SPECIAL_TOKEN_PATTERN.exec(text)) !== null;) {
    if (match.index > lastIndex) {
      segments.push(seg(text.slice(lastIndex, match.index), tone, opts));
    }

    const token = match[0] ?? "";
    const tokenTone: TranscriptSegment["tone"] =
      token.startsWith("/") && !token.slice(1).includes("/")
        ? "command"
        : "file";

    segments.push(
      seg(token, tokenTone, {
        bold: opts?.bold,
        italic: opts?.italic,
      }),
    );

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    segments.push(seg(text.slice(lastIndex), tone, opts));
  }
}

function parseInline(
  text: string,
  tone: TranscriptSegment["tone"] = "default",
  opts?: Pick<TranscriptSegment, "bold" | "dim" | "italic">,
  highlightTokens = true,
): TranscriptSegment[] {
  const key = `${tone}|${opts?.bold ? 1 : 0}|${opts?.dim ? 1 : 0}|${opts?.italic ? 1 : 0}|${highlightTokens ? 1 : 0}|${text}`;
  return getCached(parseInlineCache, key, () => {
    const segments: TranscriptSegment[] = [];
    const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        if (highlightTokens) {
          pushHighlightedText(segments, text.slice(lastIndex, match.index), tone, opts);
        } else {
          segments.push(seg(text.slice(lastIndex, match.index), tone, opts));
        }
      }
      if (match[0].startsWith("***")) {
        const boldItalicOpts = { ...opts, bold: true, italic: true };
        const boldItalicTone: TranscriptSegment["tone"] = "heading";
        if (highlightTokens) {
          pushHighlightedText(segments, match[2] ?? "", boldItalicTone, boldItalicOpts);
        } else {
          segments.push(seg(match[2] ?? "", boldItalicTone, boldItalicOpts));
        }
      } else if (match[0].startsWith("**")) {
        const boldOpts = { ...opts, bold: true };
        const boldTone: TranscriptSegment["tone"] = "heading";
        if (highlightTokens) {
          pushHighlightedText(segments, match[3] ?? "", boldTone, boldOpts);
        } else {
          segments.push(seg(match[3] ?? "", boldTone, boldOpts));
        }
      } else if (match[0].startsWith("*")) {
        const italicOpts = { ...opts, italic: true };
        const italicTone: TranscriptSegment["tone"] = "accent";
        if (highlightTokens) {
          pushHighlightedText(segments, match[4] ?? "", italicTone, italicOpts);
        } else {
          segments.push(seg(match[4] ?? "", italicTone, italicOpts));
        }
      } else {
        segments.push(seg(match[5] ?? "", "code", { bold: opts?.bold }));
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      if (highlightTokens) {
        pushHighlightedText(segments, text.slice(lastIndex), tone, opts);
      } else {
        segments.push(seg(text.slice(lastIndex), tone, opts));
      }
    }

    return segments.length > 0 ? segments : [seg(text, tone, opts)];
  });
}

// ---------------------------------------------------------------------------
// Word wrap
// ---------------------------------------------------------------------------

function wrapText(text: string, maxWidth: number): string[] {
  const key = `${maxWidth}|${text}`;
  return getCached(wrapTextCache, key, () => {
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
        if (!word) { current += " "; continue; }
        if (current.length === 0) {
          current = word;
        } else if (current.length + 1 + word.length <= safeWidth) {
          current += ` ${word}`;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current.length > 0) lines.push(current);
    }

    return lines.length > 0 ? lines : [""];
  });
}

function renderMarkdownLine(line: string): TranscriptSegment[] {
  return getCached(renderMarkdownLineCache, line, () => {
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const marker =
        level === 1 ? "◆ " :
        level === 2 ? "◇ " :
        level === 3 ? "• " :
        "◦ ";
      return [
        seg(marker, "heading", { bold: true }),
        ...parseInline(headingMatch[2] ?? "", "heading", { bold: true }),
      ];
    }

    const bulletMatch = /^[•\-\*]\s+(.+)$/.exec(line);
    if (bulletMatch) return [seg("• ", "muted"), ...parseInline(bulletMatch[1] ?? "")];

    const numberedMatch = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numberedMatch) return [seg(`${numberedMatch[1]}. `, "muted"), ...parseInline(numberedMatch[2] ?? "")];

    if (line.startsWith("✓ ") || line.startsWith("- [x] ")) {
      const text = line.replace(/^(✓ |- \[x\] )/, "");
      return [seg("✓ ", "success"), ...parseInline(text)];
    }

    if (line.trim() === "") return [seg("")];
    return parseInline(line);
  });
}

// All first lines: [timestamp:8]["  ":2][indicator:1][" ":1] = col 12 before content.
// Continuation lines must match: [blank:8]["    ":4] = col 12.
const CONTINUATION_BEFORE: TranscriptSegment[] = [
  seg(BLANK_TIMESTAMP, "muted"),
  seg("    ", "muted"),
];

// ---------------------------------------------------------------------------
// Per-level renderers
// ---------------------------------------------------------------------------

function renderUser(entry: LogEntry, width: number): TranscriptRow[] {
  const prefixWidth = TIMESTAMP_WIDTH + 5;
  const contentWidth = Math.max(8, width - prefixWidth);
  const lines = wrapText(entry.message, contentWidth);
  return lines.map((line, i) =>
    i === 0
      ? makeRow(
          `${entry.id}:0`,
          [seg(entry.time, "muted"), seg("  › ", "accent")],
          parseInline(line, "default", undefined, false).map((s) => ({ ...s, bold: true })),
        )
      : makeRow(`${entry.id}:${i}`, CONTINUATION_BEFORE, parseInline(line, "default", undefined, false).map((s) => ({ ...s, bold: true }))),
  );
}

function renderSection(entry: LogEntry, _width: number): TranscriptRow[] {
  const active = !entry.finished;
  const indicator = active
    ? spinnerIndicator("cyan")
    : iconIndicator("✓", "green", { bold: true });

  return [
    makeRow(
      entry.id,
      [seg(entry.time, "muted"), seg("  ", "muted")],
      [
        seg(" ", "muted"),
        ...parseInline(entry.message, active ? "heading" : "muted", { bold: active }, false),
      ],
      indicator,
    ),
  ];
}

function renderBullet(entry: LogEntry, width: number): TranscriptRow[] {
  const active = !entry.done;
  const indicator = active
    ? spinnerIndicator("cyan")
    : iconIndicator("✓", "green");
  const tone: TranscriptSegment["tone"] = active ? "default" : "muted";

  const rows: TranscriptRow[] = [
    makeRow(
      `${entry.id}:title`,
      [seg(entry.time, "muted"), seg("  ", "muted")],
      [seg(" ", "muted"), ...parseInline(entry.message, tone, undefined, false)],
      indicator,
    ),
  ];

  if (!active && entry.detail) {
    const prefixWidth = TIMESTAMP_WIDTH + 7;
    const detailWidth = Math.max(8, width - prefixWidth);
    const detailLines = wrapText(entry.detail, detailWidth);
    for (let i = 0; i < detailLines.length; i++) {
      rows.push(
        makeRow(
          `${entry.id}:detail:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg("  ⎿  ", "muted", { dim: true })],
          parseInline(detailLines[i] ?? "", "muted", { dim: true }, false),
        ),
      );
    }
  }

  return rows;
}

function renderSimple(
  entry: LogEntry,
  iconChar: string,
  iconColor: string,
  msgTone: TranscriptSegment["tone"],
  width: number,
): TranscriptRow[] {
  const prefixWidth = TIMESTAMP_WIDTH + 4; // 8 + "  "(2) + indicator(1) + " "(1) = 12
  const contentWidth = Math.max(8, width - prefixWidth);
  const lines = wrapText(entry.message, contentWidth);
  return lines.map((line, i) =>
    i === 0
      ? makeRow(
          `${entry.id}:${i}`,
          [seg(entry.time, "muted"), seg("  ", "muted")],
          [seg(" ", "muted"), ...parseInline(line, msgTone, undefined, false)],
          iconIndicator(iconChar, iconColor),
        )
      : makeRow(`${entry.id}:${i}`, CONTINUATION_BEFORE, parseInline(line, msgTone, undefined, false)),
  );
}

function renderThink(entry: LogEntry, width: number): TranscriptRow[] {
  const active = !entry.finished;
  const prefixWidth = TIMESTAMP_WIDTH + 4;
  const contentWidth = Math.max(8, width - prefixWidth);
  const label = active ? "Thinking: " : "Thought: ";
  const text = `${label}${entry.message}`.trim();
  const lines = wrapText(text, contentWidth);

  return lines.map((line, i) =>
    i === 0
      ? makeRow(
          `${entry.id}:${i}`,
          [seg(entry.time, "muted"), seg("  ", "muted")],
          [seg(" ", "muted"), ...parseInline(line, "muted", { dim: true }, false)],
          active ? spinnerIndicator("gray") : iconIndicator("·", "gray", { dim: true }),
        )
      : makeRow(
          `${entry.id}:${i}`,
          CONTINUATION_BEFORE,
          parseInline(line, "muted", { dim: true }, false),
        ),
  );
}

function renderDiff(entry: LogEntry, width: number): TranscriptRow[] {
  const diff = entry.diff as DiffEntry | undefined;
  const rows: TranscriptRow[] = [];

  // Header row: △ file +N -N
  const headerSegments = diff
    ? [
        seg(" ", "muted"),
        seg(diff.file, "file"),
        seg("  ", "muted"),
        seg(`+${diff.added}`, "success"),
        seg(" ", "muted"),
        seg(`-${diff.removed}`, "danger"),
      ]
    : [seg(" ", "muted"), ...parseInline(entry.message, "muted", undefined, false)];

  rows.push(
    makeRow(
      `${entry.id}:header`,
      [seg(entry.time, "muted"), seg("  △ ", "muted")],
      headerSegments,
    ),
  );

  if (!diff) return rows;

  // ── Compact hunk builder ──────────────────────────────────────────────────
  // Only emit context lines within DIFF_CONTEXT positions of an add/remove.
  // Insert a "gap" marker whenever we skip lines between two visible runs.

  type Slot = { kind: "line"; idx: number } | { kind: "gap" };
  const slots: Slot[] = [];
  const lines = diff.lines;

  // Mark every index that is "near" a change
  const nearChange = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.type !== "context") {
      for (let j = Math.max(0, i - DIFF_CONTEXT); j <= Math.min(lines.length - 1, i + DIFF_CONTEXT); j++) {
        nearChange.add(j);
      }
    }
  }

  let prevIncluded = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!nearChange.has(i)) continue;
    if (prevIncluded >= 0 && i > prevIncluded + 1) {
      slots.push({ kind: "gap" });
    }
    slots.push({ kind: "line", idx: i });
    prevIncluded = i;
  }

  // ── Truncate to MAX_DIFF_SLOTS ────────────────────────────────────────────
  const visible = slots.slice(0, MAX_DIFF_SLOTS);
  const overflow = slots.length - visible.length;

  // Content width: BLANK(8) + "  "(2) + lineNo(4) + " ± "(3) = 17 prefix chars
  const contentWidth = Math.max(8, width - (TIMESTAMP_WIDTH + 9));

  for (let i = 0; i < visible.length; i++) {
    const slot = visible[i]!;

    if (slot.kind === "gap") {
      rows.push(
        makeRow(
          `${entry.id}:gap:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg("   ···   ", "muted", { dim: true })],
          [],
        ),
      );
      continue;
    }

    const dl = lines[slot.idx]!;
    const lineNoStr = String(dl.lineNo).padStart(4, " ");
    const raw =
      dl.content.length > contentWidth
        ? `${dl.content.slice(0, contentWidth - 1)}…`
        : dl.content;

    if (dl.type === "add") {
      rows.push(
        makeRow(
          `${entry.id}:line:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg(`  ${lineNoStr} + `, "success", { dim: true })],
          [seg(raw, "success")],
        ),
      );
    } else if (dl.type === "remove") {
      rows.push(
        makeRow(
          `${entry.id}:line:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg(`  ${lineNoStr} - `, "danger", { dim: true })],
          [seg(raw, "danger")],
        ),
      );
    } else {
      rows.push(
        makeRow(
          `${entry.id}:line:${i}`,
          [seg(BLANK_TIMESTAMP, "muted"), seg(`  ${lineNoStr}   `, "muted", { dim: true })],
          [seg(raw, "muted", { dim: true })],
        ),
      );
    }
  }

  if (overflow > 0) {
    rows.push(
      makeRow(
        `${entry.id}:truncated`,
        [seg(BLANK_TIMESTAMP, "muted"), seg("         ", "muted")],
        [seg(`… ${overflow} more lines`, "muted", { dim: true })],
      ),
    );
  }

  return rows;
}

function renderResponse(entry: LogEntry, width: number): TranscriptRow[] {
  const active = entry.level === "stream";
  const indicator = active
    ? spinnerIndicator("green")
    : iconIndicator("✓", "green", { bold: true });
  const prefixWidth = TIMESTAMP_WIDTH + 4;
  const contentWidth = Math.max(8, width - prefixWidth);
  const rows: TranscriptRow[] = [];

  // Active streaming: render the live answer directly so we do not duplicate
  // it again in the status line below.
  if (active) {
    const contentLines = entry.message.split("\n");

    if (contentLines.every((line) => line.trim() === "")) {
      rows.push(
        makeRow(
          `${entry.id}:responding`,
          [seg(entry.time, "muted"), seg("  ", "muted")],
          [seg(" ", "muted"), seg("Responding…", "muted", { italic: true, dim: true })],
          indicator,
        ),
      );
      return rows;
    }

    for (let i = 0; i < contentLines.length; i++) {
      const rawLine = contentLines[i] ?? "";
      const wrapped = wrapText(rawLine, contentWidth);

      for (let j = 0; j < wrapped.length; j++) {
        const line = wrapped[j] ?? "";
        const isFirst = i === 0 && j === 0;
        const key = `${entry.id}:${i}:${j}`;
        const rendered = renderMarkdownLine(line);

        if (isFirst) {
          rows.push(
            makeRow(
              key,
              [seg(entry.time, "muted"), seg("  ", "muted")],
              [seg(" ", "muted"), ...rendered],
              indicator,
            ),
          );
        } else {
          rows.push(makeRow(key, CONTINUATION_BEFORE, rendered));
        }
      }
    }

    return rows;
  }

  // Finalized response: full markdown rendering
  const contentLines = entry.message.split("\n");

  for (let i = 0; i < contentLines.length; i++) {
    const rawLine = contentLines[i] ?? "";
    const wrapped = wrapText(rawLine, contentWidth);

    for (let j = 0; j < wrapped.length; j++) {
      const line = wrapped[j] ?? "";
      const isFirst = i === 0 && j === 0;
      const key = `${entry.id}:${i}:${j}`;
      const rendered = renderMarkdownLine(line);

      if (isFirst) {
        rows.push(
          makeRow(
            key,
            [seg(entry.time, "muted"), seg("  ", "muted")],
            [seg(" ", "muted"), ...rendered],
            indicator,
          ),
        );
      } else {
        rows.push(makeRow(key, CONTINUATION_BEFORE, rendered));
      }
    }
  }

  if (rows.length === 0) {
    rows.push(
      makeRow(
        `${entry.id}:empty`,
        [seg(entry.time, "muted"), seg("  ", "muted")],
        [],
        indicator,
      ),
    );
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Rolling-window bullet filter
//
// Rules:
//   • Keep a simple rolling window of the last N bullet rows globally.
//   • New steps appear at the bottom.
//   • Older steps fall off from the top one-by-one as new ones arrive.
//
// This avoids whole groups disappearing at once when a section finishes and
// makes the progression feel continuous in the terminal.
// ---------------------------------------------------------------------------

const MAX_VISIBLE_BULLETS = 5;
const MAX_VISIBLE_SECTIONS = 5;

function computeVisibleBulletIds(log: LogEntry[]): Set<string> {
  const bulletIds = log
    .filter((entry) => entry.level === "bullet")
    .map((entry) => entry.id);

  return new Set(bulletIds.slice(-MAX_VISIBLE_BULLETS));
}

function computeVisibleSectionIds(log: LogEntry[]): Set<string> {
  const sections = log
    .filter((entry) => entry.level === "section")
    .map((entry) => entry.id);

  return new Set(sections.slice(-MAX_VISIBLE_SECTIONS));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function formatLogTranscriptRows(
  log: LogEntry[],
  width: number,
): TranscriptRow[] {
  const visibleBullets = computeVisibleBulletIds(log);
  const visibleSections = computeVisibleSectionIds(log);
  const rows: TranscriptRow[] = [];
  let renderedEntryCount = 0;
  let previousRenderedLevel: LogEntry["level"] | null = null;

  const maybeAddGap = (entry: LogEntry) => {
    if (renderedEntryCount === 0) return;
    rows.push(makeSpacerRow(`${entry.id}:gap-before`));
  };

  const pushRendered = (entry: LogEntry, renderedRows: TranscriptRow[]) => {
    if (renderedRows.length === 0) return;
    maybeAddGap(entry);
    rows.push(...renderedRows);
    renderedEntryCount += 1;
    previousRenderedLevel = entry.level;
  };

  for (const entry of log) {
    switch (entry.level) {
      case "user":
        pushRendered(entry, renderUser(entry, width));
        break;

      case "section":
        if (visibleSections.has(entry.id)) {
          pushRendered(entry, renderSection(entry, width));
        }
        break;

      case "bullet":
        // Only render bullets that survived the rolling-window filter
        if (visibleBullets.has(entry.id)) {
          pushRendered(entry, renderBullet(entry, width));
        }
        break;

      case "info":
        pushRendered(entry, renderSimple(entry, "ℹ", "gray", "muted", width));
        break;

      case "ok":
        pushRendered(entry, renderSimple(entry, "✓", "green", "default", width));
        break;

      case "error":
        pushRendered(entry, renderSimple(entry, "✗", "red", "danger", width));
        break;

      case "think":
        pushRendered(entry, renderThink(entry, width));
        break;

      case "diff":
        pushRendered(entry, renderDiff(entry, width));
        break;

      case "stream":
      case "response":
        pushRendered(entry, renderResponse(entry, width));
        break;
    }
  }

  return rows;
}

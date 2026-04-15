import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { LogEntry } from "../types";
import { DiffView } from "./DiffView";

// ─── Timestamp ────────────────────────────────────────────────────────────────

function Ts({ time }: { time: string }) {
  return <Text color="gray">{time}</Text>;
}

// ─── Formatted text renderer ──────────────────────────────────────────────────
// Renders plain-text lines with lightweight structure recognition.

interface FormattedTextProps {
  text: string;
  width: number;
  streaming?: boolean;
}

function FormattedText({ text, width, streaming }: FormattedTextProps) {
  const lines = text.split("\n");

  return (
    <Box flexDirection="column" width={Math.max(1, width)}>
      {lines.map((line, i) => {
        const isLast = i === lines.length - 1;
        const cursor = streaming && isLast ? <Text color="green">▌</Text> : null;

        // ## Section header
        if (/^#{1,3} /.test(line)) {
          const content = line.replace(/^#{1,3} /, "");
          return (
            <Box key={i} marginTop={i === 0 ? 0 : 1}>
              <Text color="cyan" bold>{content}</Text>
              {cursor}
            </Box>
          );
        }

        // • or - bullet point
        if (/^[•\-\*] /.test(line)) {
          const content = line.replace(/^[•\-\*] /, "");
          return (
            <Box key={i} gap={1}>
              <Text color="gray">  •</Text>
              <Text color="white" wrap="wrap">{content}{cursor}</Text>
            </Box>
          );
        }

        // ✓ success line
        if (line.startsWith("✓")) {
          return (
            <Box key={i} gap={1}>
              <Text color="green">✓</Text>
              <Text color="white" bold wrap="wrap">{line.slice(1).trim()}{cursor}</Text>
            </Box>
          );
        }

        // ✗ failure line
        if (line.startsWith("✗")) {
          return (
            <Box key={i} gap={1}>
              <Text color="red">✗</Text>
              <Text color="red" wrap="wrap">{line.slice(1).trim()}{cursor}</Text>
            </Box>
          );
        }

        // Blank line → skip (cursor shows on last real line)
        if (!line.trim()) {
          return cursor ? <Box key={i}>{cursor}</Box> : null;
        }

        // Normal prose line
        return (
          <Box key={i}>
            <Text color="white" wrap="wrap">{line}{cursor}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── User prompt ──────────────────────────────────────────────────────────────

function UserRow({ entry }: { entry: LogEntry }) {
  return (
    <Box paddingX={1} marginTop={1} gap={2}>
      <Ts time={entry.time} />
      <Text color="#e07b39" bold>{entry.message}</Text>
    </Box>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionRow({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const spinning = !entry.finished && isLast;
  return (
    <Box paddingX={1} marginTop={1} gap={2}>
      <Ts time={entry.time} />
      {spinning
        ? <Text color="cyan"><Spinner type="dots" /></Text>
        : <Text color="green">✓</Text>
      }
      <Text color="white" bold>{entry.message}</Text>
    </Box>
  );
}

// ─── Bullet — one tool call ───────────────────────────────────────────────────

function BulletRow({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const spinning = !entry.done && isLast;
  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={2}>
        <Ts time={entry.time} />
        {spinning
          ? <Text color="gray"><Spinner type="dots" /></Text>
          : <Text color="gray">·</Text>
        }
        <Text color="white" wrap="wrap">
          {entry.message}
        </Text>
      </Box>
      {entry.done && entry.detail && (
        <Box paddingLeft={9} flexDirection="column">
          {entry.detail.split("\n").map((line, i) => (
            <Text key={i} color="cyan">{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Thinking block ───────────────────────────────────────────────────────────

function ThinkBlock({ entry, isLast }: { entry: LogEntry; isLast: boolean }) {
  const live = !entry.finished && isLast;
  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={2}>
        <Ts time={entry.time} />
        {live
          ? <Text color="gray"><Spinner type="dots" /></Text>
          : <Text color="gray">⟳</Text>
        }
        <Text color="gray">{live ? "thinking…" : "thought"}</Text>
      </Box>
      <Box
        borderStyle="single"
        borderColor="gray"
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        paddingLeft={1}
        marginLeft={9}
      >
        <Text color="gray" wrap="wrap">{entry.message}</Text>
      </Box>
    </Box>
  );
}

// ─── Diff block ───────────────────────────────────────────────────────────────

function DiffBlock({ entry, contentWidth }: { entry: LogEntry; contentWidth: number }) {
  const added = entry.diff?.added ?? 0;
  const removed = entry.diff?.removed ?? 0;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box paddingX={1} gap={2}>
        <Ts time={entry.time} />
        <Text color="yellow">✎</Text>
        <Text color="yellow" bold>{entry.message}</Text>
        <Text color="gray">
          {added > 0 ? `+${added}` : ""}{removed > 0 ? `  -${removed}` : ""}
        </Text>
      </Box>
      {entry.diff && <DiffView diff={entry.diff} width={contentWidth - 2} />}
    </Box>
  );
}

// ─── Streaming / finalized response ───────────────────────────────────────────

function ResponseRow({
  entry,
  isLast,
  contentWidth,
}: {
  entry: LogEntry;
  isLast: boolean;
  contentWidth: number;
}) {
  const streaming = entry.level === "stream" && isLast;
  const textWidth = Math.max(1, contentWidth - 9); // 1(paddingX) + 8(ts+gap)

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header row: timestamp + status icon */}
      <Box paddingX={1} gap={2}>
        <Ts time={entry.time} />
        {streaming
          ? <Text color="green"><Spinner type="dots" /></Text>
          : <Text color="green">✓</Text>
        }
      </Box>
      {/* Formatted body indented under the icon */}
      <Box paddingLeft={9} flexDirection="column">
        <FormattedText
          text={entry.message}
          width={textWidth}
          streaming={streaming}
        />
      </Box>
    </Box>
  );
}

// ─── Info ─────────────────────────────────────────────────────────────────────

function InfoRow({ entry }: { entry: LogEntry }) {
  return (
    <Box paddingX={1} gap={2}>
      <Ts time={entry.time} />
      <Text color="gray">◆</Text>
      <Text color="gray" wrap="wrap">{entry.message}</Text>
    </Box>
  );
}

// ─── Ok ───────────────────────────────────────────────────────────────────────

function OkRow({ entry }: { entry: LogEntry }) {
  return (
    <Box paddingX={1} gap={2}>
      <Ts time={entry.time} />
      <Text color="green">✓</Text>
      <Text color="gray" wrap="wrap">{entry.message}</Text>
    </Box>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

function ErrorRow({ entry }: { entry: LogEntry }) {
  return (
    <Box paddingX={1} gap={2}>
      <Ts time={entry.time} />
      <Text color="red">✗</Text>
      <Text color="red" wrap="wrap">{entry.message}</Text>
    </Box>
  );
}

// ─── Row dispatcher ───────────────────────────────────────────────────────────

interface LogRowProps {
  entry: LogEntry;
  isLast: boolean;
  contentWidth: number;
}

function LogRow({ entry, isLast, contentWidth }: LogRowProps) {
  switch (entry.level) {
    case "user":     return <UserRow entry={entry} />;
    case "section":  return <SectionRow entry={entry} isLast={isLast} />;
    case "bullet":   return <BulletRow entry={entry} isLast={isLast} />;
    case "think":    return <ThinkBlock entry={entry} isLast={isLast} />;
    case "diff":     return <DiffBlock entry={entry} contentWidth={contentWidth} />;
    case "stream":
    case "response": return <ResponseRow entry={entry} isLast={isLast} contentWidth={contentWidth} />;
    case "info":     return <InfoRow entry={entry} />;
    case "ok":       return <OkRow entry={entry} />;
    case "error":    return <ErrorRow entry={entry} />;
    default:         return <InfoRow entry={entry} />;
  }
}

// ─── Height estimation ────────────────────────────────────────────────────────
// These are CONSERVATIVE estimates — slightly under is better than over.
// The scroll loop has a safety net to always show at least one entry.

// Keep in sync with DiffView.tsx MAX_DIFF_LINES
const MAX_DIFF_LINES_DISPLAY = 40;

function estimateEntryHeight(entry: LogEntry, contentWidth: number): number {
  switch (entry.level) {
    case "user":    return 2; // marginTop(1) + row(1)
    case "section": return 2; // marginTop(1) + row(1)
    case "bullet": {
      const detailLines = entry.detail ? entry.detail.split("\n").length : 0;
      return 1 + detailLines;
    }
    case "think": {
      const w = Math.max(1, contentWidth - 10);
      return 2 + Math.ceil(entry.message.length / w);
    }
    case "diff": {
      // Cap at MAX_DIFF_LINES_DISPLAY + 1 for the truncation line
      const rendered = Math.min(entry.diff?.lines.length ?? 0, MAX_DIFF_LINES_DISPLAY + 1);
      return 4 + rendered; // marginTop(1) + header(1) + border-top(1) + lines + border-bottom(1)
    }
    case "stream":
    case "response": {
      // Split on actual newlines — each line takes 1 row + wrapping
      const textWidth = Math.max(1, contentWidth - 12);
      const lines = entry.message.split("\n");
      let h = 2; // marginTop(1) + header-row(1)
      for (const line of lines) {
        if (!line.trim()) continue; // blank lines render as nothing
        h += Math.max(1, Math.ceil(line.length / textWidth));
      }
      return h;
    }
    default: {
      const avail = Math.max(1, contentWidth - 12);
      return Math.max(1, Math.ceil(entry.message.length / avail));
    }
  }
}

// ─── Agent Log ────────────────────────────────────────────────────────────────

interface AgentLogProps {
  entries: LogEntry[];
  contentWidth: number;
  height: number;
  scrollOffset: number;
}

export default function AgentLog({ entries, contentWidth, height, scrollOffset }: AgentLogProps) {
  const endIdx = Math.max(0, entries.length - scrollOffset);
  const hasNewer = endIdx < entries.length;
  const usableHeight = height - (hasNewer ? 1 : 0);

  let linesUsed = 0;
  let startIdx = endIdx;
  for (let i = endIdx - 1; i >= 0; i--) {
    const h = estimateEntryHeight(entries[i]!, contentWidth);
    // Always include at least one entry even if it exceeds the viewport height.
    // Only stop when we already have content AND adding this entry would overflow.
    if (linesUsed > 0 && linesUsed + h > usableHeight) break;
    linesUsed += h;
    startIdx = i;
  }
  const visible = entries.slice(startIdx, endIdx);
  const hasOlder = startIdx > 0;

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
      {hasOlder && (
        <Box paddingX={1}>
          <Text color="gray">↑ {startIdx} older {startIdx === 1 ? "entry" : "entries"} above</Text>
        </Box>
      )}

      {visible.map((entry, i) => (
        <LogRow
          key={entry.id}
          entry={entry}
          isLast={!hasNewer && i === visible.length - 1}
          contentWidth={contentWidth}
        />
      ))}

      {hasNewer && (
        <Box paddingX={1}>
          <Text color="gray">
            ↓ {entries.length - endIdx} newer {entries.length - endIdx === 1 ? "entry" : "entries"} below
          </Text>
        </Box>
      )}
    </Box>
  );
}

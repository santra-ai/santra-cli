import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { LogEntry } from "../types";
import { DiffView } from "./DiffView";

// ─── Tool call block ──────────────────────────────────────────────────────────

function ToolCallBlock({
  entry,
  isLast,
}: {
  entry: LogEntry;
  isLast: boolean;
}) {
  // Parse "fn_name(arg1, arg2)" → { name, args }
  const parenIdx = entry.message.indexOf("(");
  const name = parenIdx >= 0 ? entry.message.slice(0, parenIdx) : entry.message;
  const args =
    parenIdx >= 0
      ? entry.message.slice(parenIdx + 1, entry.message.lastIndexOf(")"))
      : "";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* First line: timestamp  →  tool_name  [spinner|✓] */}
      <Box gap={2}>
        <Text color="gray" dimColor>
          {entry.time}
        </Text>
        <Text color="magenta">→</Text>
        <Text color="magenta" bold>
          {name}
        </Text>
        {isLast ? (
          <Text color="magenta">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color="green" dimColor>
            ✓
          </Text>
        )}
      </Box>
      {/* Second line: arguments, indented under the tool name */}
      {args !== "" && (
        <Box paddingLeft={8}>
          <Text color="yellow" dimColor wrap="truncate">
            {args}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Think block ──────────────────────────────────────────────────────────────

function ThinkBlock({ text }: { text: string }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="green"
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      paddingLeft={1}
      marginLeft={7}
      marginY={0}
    >
      <Text color="green" dimColor>
        REASONING
      </Text>
      <Text color="gray" wrap="wrap">
        {text}
      </Text>
    </Box>
  );
}

// ─── Per-entry icon ───────────────────────────────────────────────────────────

function LogIcon({
  level,
  isLast,
}: {
  level: LogEntry["level"];
  isLast?: boolean;
}) {
  if (level === "ok") return <Text color="green">✓</Text>;
  if (level === "error") return <Text color="red">✗</Text>;
  if (level === "think") return <Text color="green">⟳</Text>;
  if (level === "diff") return <Text color="yellow">✎</Text>;
  if (level === "info" && isLast)
    return (
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
    );
  return <Text color="blue">◆</Text>;
}

// ─── Single log row ───────────────────────────────────────────────────────────

interface LogRowProps {
  entry: LogEntry;
  isLast: boolean;
  contentWidth: number;
}

function LogRow({ entry, isLast, contentWidth }: LogRowProps) {
  if (entry.level === "tool") {
    return <ToolCallBlock entry={entry} isLast={isLast} />;
  }

  if (entry.level === "think") {
    return <ThinkBlock text={entry.message} />;
  }

  if (entry.level === "diff" && entry.diff) {
    return (
      <Box flexDirection="column">
        <Box gap={2} paddingX={1}>
          <Text color="gray" dimColor>
            {entry.time}
          </Text>
          <LogIcon level={entry.level} />
          <Text color="yellow">{entry.message}</Text>
        </Box>
        <DiffView diff={entry.diff} width={contentWidth - 2} />
      </Box>
    );
  }

  return (
    <Box gap={2} paddingX={1}>
      <Text color="gray" dimColor>
        {entry.time}
      </Text>
      <LogIcon level={entry.level} isLast={isLast} />
      <Text wrap="truncate">{entry.message}</Text>
    </Box>
  );
}

// ─── Height estimation ────────────────────────────────────────────────────────

function estimateEntryHeight(entry: LogEntry): number {
  if (entry.level === "think") return 4; // label + ~2 text lines + border
  if (entry.level === "diff" && entry.diff) return 3 + entry.diff.lines.length;
  if (entry.level === "tool") {
    // Two rows when there are arguments, one row when there aren't
    const hasArgs =
      entry.message.includes("(") &&
      entry.message.indexOf("(") < entry.message.lastIndexOf(")") - 1;
    return hasArgs ? 2 : 1;
  }
  return 1;
}

// ─── Agent Log ────────────────────────────────────────────────────────────────

interface AgentLogProps {
  entries: LogEntry[];
  contentWidth: number;
  height: number;
  scrollOffset: number;
}

export default function AgentLog({
  entries,
  contentWidth,
  height,
  scrollOffset,
}: AgentLogProps) {
  // endIdx: how far from the start of the entries array we show up to.
  // scrollOffset=0 → show newest (endIdx = entries.length)
  // scrollOffset=N → scroll back N entries from the end
  const endIdx = Math.max(0, entries.length - scrollOffset);
  const hasNewer = endIdx < entries.length; // there are newer entries below viewport

  // Reserve 1 row for the "↓ newer" indicator if needed
  const usableHeight = height - (hasNewer ? 1 : 0);

  let linesUsed = 0;
  let startIdx = endIdx;
  for (let i = endIdx - 1; i >= 0; i--) {
    const h = estimateEntryHeight(entries[i]!);
    if (linesUsed + h > usableHeight) break;
    linesUsed += h;
    startIdx = i;
  }
  const visible = entries.slice(startIdx, endIdx);
  const hasOlder = startIdx > 0; // there are older entries above viewport

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
      {/* Indicator: older entries above */}
      {hasOlder && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            ↑ {startIdx} older entr{startIdx === 1 ? "y" : "ies"} above
          </Text>
        </Box>
      )}

      {visible.map((entry, i) => (
        <LogRow
          key={entry.id}
          entry={entry}
          // Only the globally-last entry gets the "live" spinner treatment
          isLast={!hasNewer && i === visible.length - 1}
          contentWidth={contentWidth}
        />
      ))}

      {/* Indicator: newer entries below (user has scrolled up) */}
      {hasNewer && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            ↓ {entries.length - endIdx} newer entr
            {entries.length - endIdx === 1 ? "y" : "ies"} below
          </Text>
        </Box>
      )}
    </Box>
  );
}

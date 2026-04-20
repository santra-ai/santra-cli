import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TranscriptRow, TranscriptSegment } from "../transcript.ts";

// Santra brand palette for transcript rendering
const TONE_TO_COLOR: Record<string, string> = {
  default: "#d4d4d4",
  accent: "#F97316",    // santra orange — used for user prompts, key highlights
  muted: "#666666",
  success: "#5a9a72",
  warning: "#c8922a",
  danger: "#b05555",
  code: "#8aacde",
  heading: "#fdba74",   // light orange — warm brand tone without being too bright
  file: "#7a9dc5",
  command: "#7aaa6a",
};

function renderSegments(segments: TranscriptSegment[]) {
  return segments.map((segment, index) => (
    <Text
      key={`${segment.text}-${index}`}
      color={TONE_TO_COLOR[segment.tone ?? "default"] ?? "white"}
      bold={segment.bold}
      dimColor={segment.dim}
      italic={segment.italic}
    >
      {segment.text}
    </Text>
  ));
}

function TranscriptLine({ row, width }: { row: TranscriptRow; width: number }) {
  return (
    <Box width={width}>
      <Text wrap="wrap">
        {renderSegments(row.before)}
        {row.indicator ? (
          row.indicator.kind === "spinner" ? (
            <Text color={row.indicator.color}>
              <Spinner type="dots" />
            </Text>
          ) : (
            <Text
              color={row.indicator.color}
              bold={row.indicator.bold}
              dimColor={row.indicator.dim}
            >
              {row.indicator.text}
            </Text>
          )
        ) : null}
        {renderSegments(row.after)}
      </Text>
    </Box>
  );
}

interface TranscriptViewProps {
  rows: TranscriptRow[];
  width: number;
  height: number;
  scrollOffset: number;
}

export function TranscriptView({
  rows,
  width,
  height,
  scrollOffset,
}: TranscriptViewProps) {
  const innerWidth = Math.max(1, width - 2);
  const end = Math.max(0, rows.length - scrollOffset);
  const start = Math.max(0, end - height);
  const visibleRows = rows.slice(start, end);
  const fillerCount = Math.max(0, height - visibleRows.length);

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      {visibleRows.map((row, index) => (
        <TranscriptLine
          key={`${row.key}:${start + index}`}
          row={row}
          width={innerWidth}
        />
      ))}
      {Array.from({ length: fillerCount }, (_, index) => (
        <Text key={`filler-${index}`}>{" ".repeat(innerWidth)}</Text>
      ))}
    </Box>
  );
}

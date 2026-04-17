import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TranscriptRow, TranscriptSegment } from "../transcript.ts";

const TONE_TO_COLOR: Record<string, string> = {
  default: "white",
  accent: "#ddb27f",
  muted: "#b0b0b0",
  success: "green",
  warning: "yellow",
  danger: "red",
  code: "#9bbcff",
  heading: "yellow",
  file: "#8aaee2",
  command: "#9acb88",
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
      {visibleRows.map((row) => (
        <TranscriptLine key={row.key} row={row} width={innerWidth} />
      ))}
      {Array.from({ length: fillerCount }, (_, index) => (
        <Text key={`filler-${index}`}>{" ".repeat(innerWidth)}</Text>
      ))}
    </Box>
  );
}

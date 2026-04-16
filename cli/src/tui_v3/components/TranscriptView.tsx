import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import type { TranscriptRow, TranscriptSegment } from "../types";

const TONE_TO_COLOR: Record<string, string> = {
  default: "white",
  accent: "#ffb36b",
  muted: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  code: "cyan",
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

function TranscriptLine({ row }: { row: TranscriptRow }) {
  return (
    <Box>
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
  const end = Math.max(0, rows.length - scrollOffset);
  const start = Math.max(0, end - height);
  const visibleRows = rows.slice(start, end);
  const fillerCount = Math.max(0, height - visibleRows.length);

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      {visibleRows.map((row) => (
        <TranscriptLine key={row.key} row={row} />
      ))}
      {Array.from({ length: fillerCount }, (_, index) => (
        <Text key={`filler-${index}`}> </Text>
      ))}
    </Box>
  );
}

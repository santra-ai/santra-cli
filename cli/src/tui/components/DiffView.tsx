import { Box, Text } from "ink";
import type { DiffEntry } from "../types";

// Max lines to render — prevents the diff from overflowing the terminal and
// breaking the Ink layout. Long diffs are truncated with a summary line.
const MAX_DIFF_LINES = 40;

interface DiffLineProps {
  type: "add" | "remove" | "context";
  lineNo: number;
  content: string;
}

function DiffLine({ type, lineNo, content }: DiffLineProps) {
  // Hunk separator sentinel
  if (lineNo === -1) {
    return (
      <Box>
        <Text color="cyan">{"   @@ " + content + " @@"}</Text>
      </Box>
    );
  }

  const prefix = type === "add" ? "+" : type === "remove" ? "-" : " ";
  const lineColor = type === "add" ? "green" : type === "remove" ? "red" : "gray";

  return (
    <Box>
      <Text color="gray">{String(lineNo).padStart(4)} </Text>
      <Text color={lineColor}>
        {prefix} {content}
      </Text>
    </Box>
  );
}

interface DiffViewProps {
  diff: DiffEntry;
  width: number;
}

export function DiffView({ diff, width }: DiffViewProps) {
  const lines = diff.lines;
  const truncated = lines.length > MAX_DIFF_LINES;
  const visibleLines = truncated ? lines.slice(0, MAX_DIFF_LINES) : lines;
  const hiddenCount = lines.length - MAX_DIFF_LINES;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      width={Math.max(10, width)}
      marginLeft={1}
      marginTop={0}
    >
      <Box flexDirection="column" paddingX={1}>
        {visibleLines.map((line, i) => (
          <DiffLine
            key={`${i}-${line.lineNo}-${line.type}`}
            type={line.type}
            lineNo={line.lineNo}
            content={line.content}
          />
        ))}
        {truncated && (
          <Box marginTop={0}>
            <Text color="gray">   … {hiddenCount} more line{hiddenCount !== 1 ? "s" : ""} hidden</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

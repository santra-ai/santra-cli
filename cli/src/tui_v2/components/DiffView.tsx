import { Box, Text } from "ink";
import type { DiffEntry } from "../types";

interface DiffLineProps {
  type: "add" | "remove" | "context";
  lineNo: number;
  content: string;
}

function DiffLine({ type, lineNo, content }: DiffLineProps) {
  const prefix = type === "add" ? "+" : type === "remove" ? "-" : " ";
  const color = type === "add" ? "green" : type === "remove" ? "red" : "gray";

  return (
    <Box gap={1}>
      <Text color="gray" dimColor>
        {String(lineNo).padStart(3)}
      </Text>
      <Text color={color}>
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
  const summary = `+${diff.added} -${diff.removed}`;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      width={width}
      marginTop={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color="cyan">{diff.file}</Text>
        <Text color="green">{summary}</Text>
      </Box>

      <Box
        borderStyle="classic"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
      />

      {/* Lines */}
      <Box flexDirection="column" paddingX={1}>
        {diff.lines.map((line, i) => (
          <DiffLine
            key={i}
            type={line.type}
            lineNo={line.lineNo}
            content={line.content}
          />
        ))}
      </Box>
    </Box>
  );
}

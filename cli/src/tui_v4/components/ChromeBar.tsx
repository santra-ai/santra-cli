import { Box, Text } from "ink";

interface ChromeBarProps {
  width: number;
  scrollOffset: number;
  hiddenRowsAbove: number;
}

function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  return `${text.slice(0, maxWidth - 1)}…`;
}

export function ChromeBar({ width, scrollOffset, hiddenRowsAbove }: ChromeBarProps) {
  const label = "Santra CLI  •  Agent Session";
  const hint = "Enter send  •  / commands  •  ↑↓ / PgUp / PgDn scroll  •  Esc stop  •  Ctrl+C exit";
  const scrollState =
    scrollOffset > 0 ? `↑ ${hiddenRowsAbove} earlier lines` : "Following live output";
  const labelText = truncate(label, Math.max(18, Math.floor(width * 0.32)));
  const hintText = truncate(hint, Math.max(18, width - 4));

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderBottom
      borderColor="gray"
    >
      <Box paddingX={1}>
        <Box flexGrow={1}>
          <Text color="#b0b0b0">●</Text>
          <Text color="#b0b0b0"> ●</Text>
          <Text color="#b0b0b0"> ●</Text>
          <Text color="#b0b0b0">  ~/santra-cli</Text>
        </Box>
        <Text color="#b0b0b0">{truncate(scrollState, Math.max(14, Math.floor(width * 0.24)))}</Text>
        <Text color="#b0b0b0">  </Text>
        <Text color="white" bold>{labelText}</Text>
      </Box>
      <Box paddingX={1}>
        <Text color="#b0b0b0" dimColor>
          {hintText}
        </Text>
      </Box>
    </Box>
  );
}

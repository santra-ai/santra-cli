import { Box, Text } from "ink";

// Santra brand colors
const ORANGE = "#F97316";
const ORANGE_DIM = "#a34d0e";
const MUTED = "#555555";
const HINT = "#4a4a4a";
const SUBTLE = "#333333";

interface ChromeBarProps {
  width: number;
  scrollOffset: number;
  hiddenRowsAbove: number;
  projectName: string;
  interactionMode: "scroll" | "select";
}

function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth === 1) return "…";
  return `${text.slice(0, maxWidth - 1)}…`;
}

export function ChromeBar({ width, scrollOffset, hiddenRowsAbove, projectName, interactionMode }: ChromeBarProps) {
  const scrollState =
    scrollOffset > 0 ? `↑ ${hiddenRowsAbove} lines` : "live";

  const hint =
    interactionMode === "scroll"
      ? "↑↓ scroll  ·  Enter send  ·  / commands  ·  F2 select  ·  Esc stop"
      : "drag to select  ·  Enter send  ·  / commands  ·  F2 scroll  ·  Esc stop";

  const leftMaxWidth = Math.max(10, Math.floor(width * 0.5) - 12);
  const projectDisplay = truncate(projectName, leftMaxWidth);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderBottom
      borderColor={SUBTLE}
    >
      <Box paddingX={1}>
        {/* Logo mark — circle echoes the Santra icon */}
        <Text color={ORANGE} bold>● </Text>
        <Text color={ORANGE} bold>santra</Text>
        <Text color={MUTED}> / </Text>
        <Text color="#c0c0c0">{projectDisplay}</Text>
        <Box flexGrow={1} />
        <Text color={scrollOffset > 0 ? ORANGE_DIM : MUTED}>
          {scrollState}
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text color={HINT}>
          {truncate(hint, Math.max(18, width - 4))}
        </Text>
      </Box>
    </Box>
  );
}

import { Box, Text } from "ink";

interface ChromeBarProps {
  width: number;
  scrollOffset: number;
  hiddenRowsAbove: number;
}

export function ChromeBar({ width, scrollOffset, hiddenRowsAbove }: ChromeBarProps) {
  const label = "TE UI v3  •  Live Agent Runtime";
  const hint = "Enter submit  •  Tab complete  •  wheel or ↑↓ scroll  •  Ctrl+C exit";
  const scrollState =
    scrollOffset > 0 ? `↑ ${hiddenRowsAbove} older lines` : "Following latest";

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
          <Text color="red">●</Text>
          <Text color="yellow"> ●</Text>
          <Text color="green"> ●</Text>
          <Text color="gray">  ~/santra-cli</Text>
        </Box>
        <Text color={scrollOffset > 0 ? "yellow" : "gray"}>{scrollState}</Text>
        <Text color="gray">  </Text>
        <Text color="white" bold>{label}</Text>
      </Box>
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          {hint}
        </Text>
      </Box>
    </Box>
  );
}

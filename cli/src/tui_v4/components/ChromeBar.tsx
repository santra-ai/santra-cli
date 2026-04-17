import { Box, Text } from "ink";

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
  const modeLabel = interactionMode === "scroll" ? "F2 select mode" : "F2 scroll mode";
  const hint =
    interactionMode === "scroll"
      ? "Enter send  •  / commands  •  scroll wheel or ↑↓  •  F2 select mode  •  /copy  •  Esc stop"
      : "Enter send  •  / commands  •  drag to select  •  F2 scroll mode  •  /copy  •  Esc stop";
  const scrollState =
    scrollOffset > 0 ? `↑ ${hiddenRowsAbove} earlier lines` : "Following live";

  // Right-side items: scroll state + app name
  const appLabel = "santra";
  const rightSection = `${modeLabel}  ${scrollState}  ${appLabel}`;
  const rightWidth = Math.min(rightSection.length + 2, Math.floor(width * 0.45));

  // Left side: project indicator
  const leftMaxWidth = Math.max(10, width - rightWidth - 4);
  const projectDisplay = truncate(projectName, leftMaxWidth);

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
          <Text color="#7CFFB2">◆ </Text>
          <Text color="white" bold>{projectDisplay}</Text>
        </Box>
        <Text color="#808080">{truncate(scrollState, Math.max(12, Math.floor(width * 0.28)))}</Text>
        <Text color="#606060">  santra</Text>
      </Box>
      <Box paddingX={1}>
        <Text color="#606060" dimColor>
          {truncate(hint, Math.max(18, width - 4))}
        </Text>
      </Box>
    </Box>
  );
}

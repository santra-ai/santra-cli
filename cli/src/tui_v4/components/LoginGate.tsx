import { Box, Text } from "ink";

type Props = {
  width: number;
  height: number;
  url: string;
  opened: boolean;
};

export function LoginGate({ width, height, url, opened }: Props) {
  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      justifyContent="center"
      paddingX={2}
    >
      <Box flexDirection="column" gap={1}>
        <Text bold color="#f97316">
          Connect Santra CLI
        </Text>
        <Text color="#d4d4d4">
          {opened
            ? "A browser window was opened for this CLI session."
            : "Open this unique link in your browser to connect this CLI session."}
        </Text>
        <Text color="#60a5fa">{url}</Text>
        <Text color="#a3a3a3">
          Waiting for sign-in to complete…
        </Text>
        <Text color="#a3a3a3">
          Press o to reopen the link or s to use /setup instead.
        </Text>
      </Box>
    </Box>
  );
}

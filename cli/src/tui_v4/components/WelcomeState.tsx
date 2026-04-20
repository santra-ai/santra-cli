import { Box, Text } from "ink";
import { useEffect, useState } from "react";

const MUTED = "#b3b3b3";
const SUBTLE = "#8f8f8f";
const TIP_ACCENT = "#60a5fa";
const TIPS = [
  ["use ", "/help", " for commands and quick shortcuts."],
  ["use ", "/resume", " to reopen a saved session."],
  ["use ", "/copy", " to copy the current transcript."],
  ["press ", "Esc", " to stop an active run."],
  ["press ", "Fn+F2", " to switch between scroll mode and select mode."],
  ["use ", "↑↓", " to scroll when you're in scroll mode."],
  ["use ", "drag to select", " when you're in select mode."],
  ["press ", "Enter", " to send your current prompt."],
  ["ask Santra to ", "scan this repo", " for a fast codebase walkthrough."],
  ["ask Santra to ", "update the README", " or explain a part of the codebase."],
];

// ─── Mini spinning logo ───────────────────────────────────────────────────────

const M_RY = 2;
const M_RX = M_RY * 2.0;
const M_H = M_RY * 2 + 1;
const M_W = Math.ceil(M_RX * 2) + 2;
const M_CX = M_W / 2;
const M_CY = M_H / 2;
const M_GAP = 1;
const NF = 32;

type MiniRow = null | { xL: number; xR: number; gL: number; gR: number };

function buildMini(): MiniRow[][] {
  const frames: MiniRow[][] = [];
  for (let f = 0; f < NF; f++) {
    const angle = (2 * Math.PI * f) / NF;
    const rows: MiniRow[] = [];
    for (let r = 0; r < M_H; r++) {
      const ny = (r - M_CY + 0.5) / M_RY;
      if (Math.abs(ny) > 1) {
        rows.push(null);
        continue;
      }
      const hw = Math.sqrt(Math.max(0, 1 - ny * ny)) * M_RX;
      const xL = Math.round(M_CX - hw);
      const xR = Math.round(M_CX + hw);
      if (xR <= xL) {
        rows.push(null);
        continue;
      }
      const gCX = M_CX + Math.sin(Math.PI * ny + angle) * hw * 0.42;
      const gL = Math.round(gCX - M_GAP / 2);
      const gR = gL + M_GAP;
      rows.push({ xL, xR, gL, gR });
    }
    frames.push(rows);
  }
  return frames;
}

const MINI_FRAMES = buildMini();

function MiniRowComp({ row }: { row: MiniRow }) {
  if (!row) return <Text>{" ".repeat(M_W)}</Text>;
  const { xL, xR, gL, gR } = row;
  const segs: { t: string; o: boolean }[] = [];
  if (xL > 0) segs.push({ t: " ".repeat(xL), o: false });
  for (let x = xL; x < xR; ) {
    if (x >= gL && x < gR) {
      const end = Math.min(gR, xR);
      segs.push({ t: " ".repeat(end - x), o: false });
      x = end;
    } else {
      const end = x < gL ? Math.min(gL, xR) : xR;
      segs.push({ t: "█".repeat(end - x), o: true });
      x = end;
    }
  }
  return (
    <Box>
      {segs.map((s, i) =>
        s.o ? (
          <Text key={i} color="#f97316">
            {s.t}
          </Text>
        ) : (
          <Text key={i}>{s.t}</Text>
        ),
      )}
    </Box>
  );
}

function MiniLogo({ frame }: { frame: number }) {
  return (
    <Box flexDirection="column">
      {MINI_FRAMES[frame]!.map((row, i) => (
        <MiniRowComp key={i} row={row} />
      ))}
    </Box>
  );
}

// ─── Welcome State ────────────────────────────────────────────────────────────

interface WelcomeStateProps {
  width: number;
  height: number;
}

export function WelcomeState({ width, height }: WelcomeStateProps) {
  const [frame, setFrame] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % NF), 50);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setTipIndex((current) => (current + 1) % TIPS.length),
      2000,
    );
    return () => clearInterval(id);
  }, []);

  const [tipPrefix, tipHighlight, tipSuffix] = TIPS[tipIndex]!;

  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      justifyContent="space-between"
    >
      {/* ── Top area: where prompts normally appear ── */}
      <Box flexDirection="column" gap={0} paddingX={2} marginTop={1}>
        <Text color="white" bold>
          Welcome to Santra
        </Text>
        <Box marginBottom={1}>
          <Text color={MUTED}>
            Santra is a repository-aware coding assistant for the terminal.
          </Text>
        </Box>

        <Box>
          <Text color={SUBTLE}>docs    → </Text>
          <Text color="#60a5fa">santra-cli.dev/docs</Text>
        </Box>
        <Box>
          <Text color={SUBTLE}>github  → </Text>
          <Text color="#60a5fa">github.com/your-org/santra-cli</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={SUBTLE}>discord → </Text>
          <Text color={TIP_ACCENT}>discord.gg/santra</Text>
        </Box>
        <Text color="white">
          Tips: <Text color={MUTED}>{tipPrefix}</Text>
          <Text color={TIP_ACCENT}>{tipHighlight}</Text>
          <Text color={MUTED}>{tipSuffix}</Text>
        </Text>
      </Box>

      {/* ── Bottom area: logo horizontally above input ── */}
      <Box
        flexDirection="row"
        alignItems="center"
        gap={3}
        paddingX={2}
        paddingBottom={0}
      >
        <Box gap={2} alignItems="center">
          <MiniLogo frame={frame} />
          <Box flexDirection="row" gap={2} alignItems="center">
            <Text color="#f97316" bold>
              santra-cli
            </Text>
            <Text color={MUTED}>
              v1.0.0
            </Text>
          </Box>
        </Box>
        
        <Text color={SUBTLE}>│</Text>
        
        <Box flexGrow={1} flexDirection="column">
          <Text color={MUTED}>ready for input…</Text>
        </Box>
      </Box>
    </Box>
  );
}

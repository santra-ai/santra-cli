import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import type { LogEntry, ShellState } from "./types";
import { DiffView } from "./components/DiffView";
import useAgent from "./hooks/useAgent";
import { Sidebar } from "./components/SiderBar";
import AgentLog from "./components/AgentLog";
import StatusBar from "./components/StatusBar";
import { getSlashSuggestions } from "./components/InputBar";

const SIDEBAR_WIDTH = 24;

type Tab = "log" | "diff" | "output";

function DiffTab({
  log,
  contentWidth,
}: {
  log: LogEntry[];
  contentWidth: number;
}) {
  const diffs = log.filter((e) => e.level === "diff" && e.diff != null);
  if (diffs.length === 0) {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text color="gray" dimColor>
          No diffs yet
        </Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexGrow={1}>
      {diffs.map((e) => (
        <Box key={e.id} flexDirection="column" paddingX={1} marginBottom={1}>
          <Box gap={2}>
            <Text color="gray" dimColor>
              {e.time}
            </Text>
            <Text color="yellow">✎ {e.message}</Text>
          </Box>
          <DiffView diff={e.diff!} width={contentWidth - 4} />
        </Box>
      ))}
    </Box>
  );
}

function OutputTab({ shell }: { shell: ShellState }) {
  if (shell.command === "") {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text color="gray" dimColor>
          No command yet
        </Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box gap={1} marginBottom={1}>
        <Text color="green">❯</Text>
        <Text bold>{shell.command}</Text>
      </Box>
      {shell.output.length === 0 ? (
        <Text color="gray" dimColor>
          Running…
        </Text>
      ) : (
        shell.output.map((line, i) => {
          const color =
            line.type === "success"
              ? "green"
              : line.type === "fail"
                ? "red"
                : "yellow";
          return (
            <Box key={i}>
              <Text color={color} wrap="wrap">
                {line.text}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();

  // Reactive dimensions — update on terminal resize
  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setTermWidth(stdout.columns);
      setTermHeight(stdout.rows);
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  const { tasks, files, log, stats } = useAgent();
  const [activeTab, setActiveTab] = useState<Tab>("log");
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevLogLenRef = useRef(log.length);

  // Input state
  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const suggestions = getSlashSuggestions(inputValue);

  const mainWidth = termWidth - SIDEBAR_WIDTH;

  // Chrome rows: tabs(2) + borders(2) + statusbar(input+stats = 4) + suggestions
  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  const logHeight = Math.max(3, termHeight - 9 - suggestionsHeight);

  // Keep viewport stable when new entries arrive while scrolled up.
  // If at the bottom (offset=0), new entries auto-scroll in naturally.
  useEffect(() => {
    const added = log.length - prevLogLenRef.current;
    if (added > 0 && scrollOffset > 0) {
      setScrollOffset((o) => o + added);
    }
    prevLogLenRef.current = log.length;
  }, [log.length]);

  useInput((input, key) => {
    // Always: hard exit
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    // Escape: clear input and dismiss suggestions
    if (key.escape) {
      setInputValue("");
      setSelectedSuggestion(0);
      return;
    }

    // Tab: complete suggestion when visible, otherwise cycle tabs (only when input empty)
    if (key.tab) {
      if (suggestions.length > 0) {
        const cmd = suggestions[selectedSuggestion];
        if (cmd) {
          setInputValue(cmd.name + " ");
          setSelectedSuggestion(0);
        }
      } else if (!inputValue) {
        setActiveTab((t) =>
          t === "log" ? "diff" : t === "diff" ? "output" : "log",
        );
        setScrollOffset(0);
      }
      return;
    }

    // Arrow keys: navigate suggestions OR scroll log
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === 0 ? suggestions.length - 1 : i - 1));
      } else if (activeTab === "log") {
        setScrollOffset((o) => o + 1);
      }
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) =>
          i === suggestions.length - 1 ? 0 : i + 1,
        );
      } else if (activeTab === "log") {
        setScrollOffset((o) => Math.max(0, o - 1));
      }
      return;
    }

    // Enter: select suggestion or submit input
    if (key.return) {
      if (suggestions.length > 0) {
        const cmd = suggestions[selectedSuggestion];
        if (cmd) {
          // TODO: wire up real command handling
          setInputValue("");
          setSelectedSuggestion(0);
        }
        return;
      }
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      // TODO: wire up real message submission
      setInputValue("");
      return;
    }

    // Backspace / delete
    if (
      key.backspace ||
      key.delete ||
      (key.ctrl && input?.toLowerCase() === "h")
    ) {
      setInputValue((v) => v.slice(0, -1));
      setSelectedSuggestion(0);
      return;
    }

    // Navigation shortcuts only work when input is empty (avoids conflicts with typing)
    if (!inputValue) {
      if (input === "q") { exit(); return; }
      if (input === "1") { setActiveTab("log"); setScrollOffset(0); return; }
      if (input === "2") { setActiveTab("diff"); return; }
      if (input === "3") { setActiveTab("output"); return; }
    }

    // Regular printable characters → append to input
    if (input && !key.ctrl && !key.meta) {
      setInputValue((v) => v + input);
      setSelectedSuggestion(0);
    }
  });

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Title bar
      <Box
        borderStyle="single"
        borderColor="green"
        borderBottom={false}
        paddingX={2}
        justifyContent="space-between"
      >
        <Text color="green" bold>
          ◆ agent
        </Text>
        <Text color="gray">~/projects/api-server</Text>
        <Text color={done ? "gray" : "green"}>
          {done ? "✓ done" : "● running"}
        </Text>
      </Box> */}

      {/* Body — flexGrow fills remaining height so the box reaches the terminal bottom */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Sidebar */}
        <Sidebar width={SIDEBAR_WIDTH} tasks={tasks} files={files} />

        {/* Main panel */}
        <Box
          flexDirection="column"
          width={mainWidth}
          borderStyle="single"
          borderColor="gray"
          borderLeft={false}
        >
          {/* Tab bar */}
          <Box
            borderStyle="classic"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
            paddingX={1}
            justifyContent="space-between"
          >
            <Box gap={2}>
              <Text
                color={activeTab === "log" ? "green" : "gray"}
                bold={activeTab === "log"}
              >
                Agent log
              </Text>
              <Text
                color={activeTab === "diff" ? "green" : "gray"}
                dimColor={activeTab !== "diff"}
              >
                Diff
              </Text>
              <Text
                color={activeTab === "output" ? "green" : "gray"}
                dimColor={activeTab !== "output"}
              >
                Output
              </Text>
            </Box>
            {activeTab === "log" && (
              <Text color="gray" dimColor>
                {scrollOffset > 0 ? `↓ back to bottom` : `↑↓ scroll`}
              </Text>
            )}
          </Box>

          {/* Tab content — column+flex-start ensures entries render top→bottom */}
          <Box flexGrow={1} flexDirection="column" justifyContent="flex-start">
            {activeTab === "log" && (
              <AgentLog
                entries={log}
                contentWidth={mainWidth}
                height={logHeight}
                scrollOffset={scrollOffset}
              />
            )}
            {activeTab === "diff" && (
              <DiffTab log={log} contentWidth={mainWidth} />
            )}
            {activeTab === "output" && <OutputTab shell={shell} />}
          </Box>

          {/* Bottom panel: input + stats */}
          <StatusBar
            stats={stats}
            inputValue={inputValue}
            inputBusy={false}
            suggestions={suggestions}
            selectedSuggestionIdx={selectedSuggestion}
          />
        </Box>
      </Box>
    </Box>
  );
}

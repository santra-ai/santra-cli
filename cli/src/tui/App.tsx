import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import useAgent from "./hooks/useAgent";
import { Sidebar } from "./components/SiderBar";
import AgentLog from "./components/AgentLog";
import StatusBar from "./components/StatusBar";
import { getSlashSuggestions } from "./components/InputBar";

const SIDEBAR_WIDTH = 24;

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();

  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setTermWidth(stdout.columns);
      setTermHeight(stdout.rows);
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  const { tasks, files, log, stats, busy, savedChats, submit, resume, handleCommand } = useAgent();
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevLogLenRef = useRef(log.length);

  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const suggestions = getSlashSuggestions(inputValue, savedChats);

  const mainWidth = termWidth - SIDEBAR_WIDTH;
  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  const logHeight = Math.max(3, termHeight - 7 - suggestionsHeight);

  // Keep viewport stable when scrolled up and new entries arrive
  useEffect(() => {
    const added = log.length - prevLogLenRef.current;
    if (added > 0 && scrollOffset > 0) {
      setScrollOffset((o) => o + added);
    }
    prevLogLenRef.current = log.length;
  }, [log.length]);

  useInput((input, key) => {
    // Ctrl+C: interrupt when busy, exit when idle
    if (key.ctrl && input === "c") {
      if (busy) handleCommand("stop");
      else exit();
      return;
    }

    // Escape: clear input
    if (key.escape) {
      setInputValue("");
      setSelectedSuggestion(0);
      return;
    }

    // Tab: complete suggestion
    if (key.tab) {
      if (suggestions.length > 0) {
        const cmd = suggestions[selectedSuggestion];
        if (cmd?.kind === "command") {
          setInputValue(cmd.name + " ");
          setSelectedSuggestion(0);
        }
      }
      return;
    }

    // Arrow keys: navigate suggestions or scroll
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === 0 ? suggestions.length - 1 : i - 1));
      } else {
        setScrollOffset((o) => o + 1);
      }
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === suggestions.length - 1 ? 0 : i + 1));
      } else {
        setScrollOffset((o) => Math.max(0, o - 1));
      }
      return;
    }

    // Enter: select suggestion or submit
    if (key.return) {
      if (suggestions.length > 0) {
        const cmd = suggestions[selectedSuggestion];
        if (cmd) {
          if (cmd.kind === "session" && cmd.chatId) {
            resume(cmd.chatId);
          } else {
            const [cmdName, ...rest] = cmd.name.trim().split(" ");
            handleCommand(cmdName ?? "", rest.join(" "));
          }
          setInputValue("");
          setSelectedSuggestion(0);
        }
        return;
      }
      const trimmed = inputValue.trim();
      if (!trimmed || busy) return;
      if (trimmed.startsWith("/")) {
        const [cmdName, ...rest] = trimmed.slice(1).split(" ");
        handleCommand(cmdName ?? "", rest.join(" "));
      } else {
        submit(trimmed);
      }
      setInputValue("");
      return;
    }

    // Backspace / delete
    if (key.backspace || key.delete || (key.ctrl && input?.toLowerCase() === "h")) {
      setInputValue((v) => v.slice(0, -1));
      setSelectedSuggestion(0);
      return;
    }

    // q to quit when input is empty
    if (!inputValue && input === "q") { exit(); return; }

    // Regular character
    if (input && !key.ctrl && !key.meta) {
      setInputValue((v) => v + input);
      setSelectedSuggestion(0);
    }
  });

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar width={SIDEBAR_WIDTH} tasks={tasks} files={files} />

        <Box
          flexDirection="column"
          width={mainWidth}
          borderStyle="single"
          borderColor="gray"
          borderLeft={false}
        >
          {/* Scroll hint bar */}
          <Box
            borderStyle="classic"
            borderBottom
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor="gray"
            paddingX={1}
            justifyContent="flex-end"
          >
            <Text color="gray">
              {scrollOffset > 0 ? "↓ back to bottom" : "↑↓ scroll"}
            </Text>
          </Box>

          {/* Agent log */}
          <Box flexGrow={1} flexDirection="column" justifyContent="flex-start">
            <AgentLog
              entries={log}
              contentWidth={mainWidth}
              height={logHeight}
              scrollOffset={scrollOffset}
            />
          </Box>

          {/* Status bar + input */}
          <StatusBar
            stats={stats}
            inputValue={inputValue}
            inputBusy={busy}
            suggestions={suggestions}
            selectedSuggestionIdx={selectedSuggestion}
          />
        </Box>
      </Box>
    </Box>
  );
}

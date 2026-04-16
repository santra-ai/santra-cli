import { Box, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import useAgent from "./hooks/useAgent";
import AgentLog from "./components/AgentLog";
import StatusBar from "./components/StatusBar";
import { getSlashSuggestions } from "./components/InputBar";

export function App() {
  const { stdout } = useStdout();
  const { exit } = useApp();

  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setTermWidth(stdout.columns);
      setTermHeight(stdout.rows);
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  // Enable terminal mouse wheel reporting and translate wheel events to scroll offsets
  useEffect(() => {
    // Enable basic mouse reporting + SGR extended coordinates for large terminals
    process.stdout.write("\x1b[?1000h\x1b[?1006h");

    const onData = (buf: Buffer) => {
      const s = buf.toString("binary");

      // SGR format:  ESC [ < Cb ; Cx ; Cy M   (Cb=64 wheel-up, 65 wheel-down)
      const sgr = s.match(/\x1b\[<(\d+);[\d]+;[\d]+M/);
      if (sgr) {
        const btn = parseInt(sgr[1]!, 10);
        if (btn === 64) setScrollOffset((o) => o + 3);
        if (btn === 65) setScrollOffset((o) => Math.max(0, o - 3));
        return;
      }

      // X10 legacy:  ESC [ M <b+32> <x+32> <y+32>
      if (s.length >= 6 && s[0] === "\x1b" && s[1] === "[" && s[2] === "M") {
        const btn = s.charCodeAt(3) - 32;
        if (btn === 64) setScrollOffset((o) => o + 3);
        if (btn === 65) setScrollOffset((o) => Math.max(0, o - 3));
      }
    };

    process.stdin.on("data", onData);

    return () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
      process.stdin.off("data", onData);
    };
  }, []);

  const { log, stats, busy, savedChats, submit, resume, handleCommand, abortCurrentRun } = useAgent();
  const prevLogLenRef = useRef(log.length);

  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const suggestions = getSlashSuggestions(inputValue, savedChats);

  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  // statusbar = top-border(1) + input(1) + stats-border(1) + stats(1) = 4 rows
  const logHeight = Math.max(3, termHeight - 4 - suggestionsHeight);

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

    // Escape: state-aware — clear input first, then interrupt active run
    if (key.escape) {
      if (inputValue) {
        setInputValue("");
        setSelectedSuggestion(0);
      } else if (busy) {
        abortCurrentRun("keyboard");
      }
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

    // Arrow keys: navigate suggestions only (scrolling is mouse-wheel)
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      return;
    }
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((i) => (i === suggestions.length - 1 ? 0 : i + 1));
        return;
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
      {/* Agent log — fills all space above the sticky status bar */}
      <Box flexGrow={1} flexDirection="column" justifyContent="flex-start">
        <AgentLog
          entries={log}
          contentWidth={termWidth}
          height={logHeight}
          scrollOffset={scrollOffset}
        />
      </Box>

      {/* Status bar + input — sticky at bottom */}
      <StatusBar
        stats={stats}
        inputValue={inputValue}
        inputBusy={busy}
        suggestions={suggestions}
        selectedSuggestionIdx={selectedSuggestion}
      />
    </Box>
  );
}

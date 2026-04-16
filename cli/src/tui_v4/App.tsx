import { Box, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSlashSuggestions } from "../tui/components/InputBar";
import useAgent from "../tui/hooks/useAgent";
import type { LogEntry } from "../tui/types/index.ts";
import { Composer } from "../tui_v3/components/Composer";
import { TranscriptView } from "../tui_v3/components/TranscriptView";
import { sanitizeComposerInput } from "../tui_v3/input";
import { ChromeBar } from "./components/ChromeBar";
import { formatLogTranscriptRows } from "./formatLogTranscript";
import { formatTranscriptStatusRows, STATUS_TIPS } from "./formatTranscriptStatusRows";

const PLACEHOLDER = "Ask the agent anything… (/ for commands)";
const TIP_ROTATION_MS = 3200;

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // ─── Terminal dimensions ──────────────────────────────────────────────────
  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 30);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setTermWidth(stdout.columns);
      setTermHeight(stdout.rows);
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  // ─── Agent runtime ────────────────────────────────────────────────────────
  const {
    log,
    tasks,
    stats,
    busy,
    savedChats,
    submit,
    resume,
    clearLog,
    handleCommand,
    abortCurrentRun,
  } = useAgent();

  // ─── Cumulative log (accumulates finished runs within this session) ───────
  // useAgent resets its log on each new submit(); we persist completed runs
  // here so the transcript shows full conversation history.
  const [cumulativeLog, setCumulativeLog] = useState<LogEntry[]>([]);
  const logRef = useRef<LogEntry[]>(log);
  logRef.current = log;

  const prevBusyRef = useRef(false);
  useEffect(() => {
    if (prevBusyRef.current && !busy) {
      // A run just finished — absorb its log into cumulative history
      const finished = logRef.current;
      if (finished.length > 0) {
        setCumulativeLog((prev) => {
          const sep: LogEntry[] = prev.length > 0
            ? [{
                id: `divider-${Date.now()}`,
                time: finished[0]?.time ?? "",
                level: "info" as const,
                message: "──────────────────────────────────────────────────",
              }]
            : [];
          return [...prev, ...sep, ...finished];
        });
        clearLog();
      }
    }
    prevBusyRef.current = busy;
  }, [busy, clearLog]);

  // Clear both cumulative and current agent log
  const clearAll = useCallback(() => {
    clearLog();
    setCumulativeLog([]);
  }, [clearLog]);

  // Intercept /clear to also wipe cumulative history
  const handleCommandV4 = useCallback(
    (cmd: string, arg?: string) => {
      if (cmd === "clear") {
        clearAll();
      } else {
        handleCommand(cmd, arg);
      }
    },
    [clearAll, handleCommand],
  );

  // Active display: cumulative runs + current run (if in progress)
  const displayLog = useMemo(
    () => [...cumulativeLog, ...log],
    [cumulativeLog, log],
  );

  // ─── Input state ──────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const suggestions = useMemo(
    () => getSlashSuggestions(inputValue, savedChats),
    [inputValue, savedChats],
  );

  useEffect(() => {
    setSelectedSuggestion((c) =>
      suggestions.length === 0 ? 0 : Math.min(c, suggestions.length - 1),
    );
  }, [suggestions]);

  useEffect(() => {
    const rotation = setInterval(() => {
      setTipIndex((current) => (current + 1) % STATUS_TIPS.length);
    }, TIP_ROTATION_MS);

    return () => {
      clearInterval(rotation);
    };
  }, []);

  const resetComposer = () => {
    setInputValue("");
    setSelectedSuggestion(0);
  };

  // ─── Transcript rows ──────────────────────────────────────────────────────
  const transcriptRows = useMemo(
    () => {
      const width = Math.max(48, termWidth - 2);
      return [
        ...formatLogTranscriptRows(displayLog, width),
        ...formatTranscriptStatusRows({
          busy,
          inputValue,
          log,
          tasks,
          tipIndex,
          width,
        }),
      ];
    },
    [busy, displayLog, inputValue, log, tasks, termWidth, tipIndex],
  );

  // ─── Scroll state ─────────────────────────────────────────────────────────
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevRowCountRef = useRef(0);

  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  const chromeHeight = 3;
  const composerHeight = 4 + suggestionsHeight;
  const transcriptHeight = Math.max(8, termHeight - chromeHeight - composerHeight);
  const maxScrollOffset = Math.max(0, transcriptRows.length - transcriptHeight);
  const pageScrollAmount = Math.max(1, Math.floor(transcriptHeight * 0.8));

  // Bump offset when new rows arrive while user is scrolled up
  useEffect(() => {
    const added = transcriptRows.length - prevRowCountRef.current;
    if (added > 0 && scrollOffset > 0) {
      setScrollOffset((c) => Math.min(maxScrollOffset, c + added));
    }
    prevRowCountRef.current = transcriptRows.length;
  }, [maxScrollOffset, scrollOffset, transcriptRows.length]);

  // Clamp offset when content shrinks
  useEffect(() => {
    setScrollOffset((c) => Math.min(c, maxScrollOffset));
  }, [maxScrollOffset]);

  // ─── Suggestion execution ─────────────────────────────────────────────────
  const executeSuggestion = useCallback(() => {
    const selected = suggestions[selectedSuggestion];
    if (!selected) return false;
    setScrollOffset(0);
    if (selected.kind === "session" && selected.chatId) {
      resume(selected.chatId);
    } else {
      const normalized = selected.name.replace(/^\//, "");
      const [cmdName, ...rest] = normalized.trim().split(" ");
      handleCommandV4(cmdName ?? "", rest.join(" "));
    }
    resetComposer();
    return true;
  }, [suggestions, selectedSuggestion, resume, handleCommandV4]);

  // ─── Keyboard handler ─────────────────────────────────────────────────────
  const canKeyboardScroll = suggestions.length === 0;

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (busy) abortCurrentRun("keyboard");
      else exit();
      return;
    }

    if (key.escape) {
      if (inputValue) resetComposer();
      else if (busy) abortCurrentRun("keyboard");
      return;
    }

    // Suggestions navigation
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((c) => (c === 0 ? suggestions.length - 1 : c - 1));
      } else if (canKeyboardScroll) {
        setScrollOffset((c) => Math.min(maxScrollOffset, c + 1));
      }
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((c) => (c === suggestions.length - 1 ? 0 : c + 1));
      } else if (canKeyboardScroll) {
        setScrollOffset((c) => Math.max(0, c - 1));
      }
      return;
    }

    if (key.tab) {
      if (suggestions.length > 0) {
        const sel = suggestions[selectedSuggestion];
        if (sel?.kind === "session" && sel.chatId) {
          setInputValue(`/resume ${sel.chatId}`);
        } else if (sel) {
          setInputValue(`${sel.name} `);
        }
        setSelectedSuggestion(0);
      }
      return;
    }

    // Keyboard scroll (only when idle and input empty)
    if (input === "k" && canKeyboardScroll) {
      setScrollOffset((c) => Math.min(maxScrollOffset, c + 1));
      return;
    }
    if (input === "j" && canKeyboardScroll) {
      setScrollOffset((c) => Math.max(0, c - 1));
      return;
    }
    if (key.pageUp && canKeyboardScroll) {
      setScrollOffset((c) => Math.min(maxScrollOffset, c + pageScrollAmount));
      return;
    }
    if (key.pageDown && canKeyboardScroll) {
      setScrollOffset((c) => Math.max(0, c - pageScrollAmount));
      return;
    }
    if (key.home && canKeyboardScroll) {
      setScrollOffset(maxScrollOffset);
      return;
    }
    if (key.end && canKeyboardScroll) {
      setScrollOffset(0);
      return;
    }

    // Enter — submit or execute suggestion
    if (key.return || input === "\r" || input === "\n") {
      if (suggestions.length > 0) {
        executeSuggestion();
        return;
      }
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      setScrollOffset(0);
      if (trimmed.startsWith("/")) {
        const [cmdName, ...rest] = trimmed.slice(1).split(" ");
        handleCommandV4(cmdName ?? "", rest.join(" "));
      } else if (!busy) {
        void submit(trimmed);
      }
      resetComposer();
      return;
    }

    if (busy) return;

    if (
      key.backspace ||
      key.delete ||
      input === "\u007f" ||
      input === "\b" ||
      (key.ctrl && input?.toLowerCase() === "h")
    ) {
      setInputValue((c) => c.slice(0, -1));
      setSelectedSuggestion(0);
      return;
    }

    if (
      key.leftArrow || key.rightArrow || key.upArrow || key.downArrow ||
      key.pageUp || key.pageDown || key.home || key.end || key.delete || key.tab
    ) {
      return;
    }

    // Regular character — sanitize to strip any leaked mouse SGR bytes
    const composerInput = sanitizeComposerInput(input);
    if (composerInput && !key.ctrl && !key.meta) {
      setInputValue((c) => `${c}${composerInput}`);
      setSelectedSuggestion(0);
    }
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <ChromeBar
        width={termWidth}
        scrollOffset={scrollOffset}
        hiddenRowsAbove={Math.min(maxScrollOffset, scrollOffset)}
      />
      <TranscriptView
        rows={transcriptRows}
        width={termWidth}
        height={transcriptHeight}
        scrollOffset={scrollOffset}
      />
      <Composer
        value={inputValue}
        busy={busy}
        placeholder={PLACEHOLDER}
        suggestions={suggestions}
        selectedSuggestionIdx={selectedSuggestion}
        stats={stats}
      />
    </Box>
  );
}

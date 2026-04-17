import path from "node:path";
import { Box, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { TranscriptView } from "./components/TranscriptView";
import { ChromeBar } from "./components/ChromeBar";
import { formatLogTranscriptRows } from "./formatLogTranscript";
import { formatTranscriptStatusRows } from "./formatTranscriptStatusRows";
import useAgent from "./hooks/useAgent";
import { getSlashSuggestions, sanitizeComposerInput } from "./input";
import type { LogEntry } from "./types.ts";

const PLACEHOLDER = "Ask the agent anything… (/ for commands)";
const MOUSE_SCROLL_LINES = 3; // lines scrolled per mouse wheel notch

// Derived once at module load — never changes during a session
const PROJECT_NAME = path.basename(process.cwd());

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

  const suggestions = useMemo(
    () => getSlashSuggestions(inputValue, savedChats),
    [inputValue, savedChats],
  );

  useEffect(() => {
    setSelectedSuggestion((c) =>
      suggestions.length === 0 ? 0 : Math.min(c, suggestions.length - 1),
    );
  }, [suggestions]);

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
          width,
        }),
      ];
    },
    [busy, displayLog, inputValue, log, tasks, termWidth],
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

  // ─── Mouse scroll ─────────────────────────────────────────────────────────
  // Keep current maxScrollOffset available to the stdin data handler without
  // a stale closure — the handler is set up once and must always read the
  // latest value.
  const maxScrollOffsetRef = useRef(maxScrollOffset);
  maxScrollOffsetRef.current = maxScrollOffset;

  // Timestamp of the most recent mouse scroll event.
  // Used to suppress leaked escape-sequence bytes from reaching the input bar.
  const lastMouseEventRef = useRef(0);

  const handleMouseScroll = useCallback((direction: "up" | "down") => {
    lastMouseEventRef.current = Date.now();
    if (direction === "up") {
      // "up" on wheel = scroll toward older (higher offset)
      setScrollOffset((c) => Math.min(maxScrollOffsetRef.current, c + MOUSE_SCROLL_LINES));
    } else {
      setScrollOffset((c) => Math.max(0, c - MOUSE_SCROLL_LINES));
    }
  }, []); // stable: relies only on refs + stable setState

  useEffect(() => {
    if (!process.stdin.isTTY) return;

    // Enable X10 basic mouse tracking + SGR extended coordinate encoding.
    // With these modes, scroll wheel events are reported to stdin.
    // Text selection still works: hold Shift (most terminals) or Option/Alt (macOS).
    process.stdout.write("\x1b[?1000h\x1b[?1006h");

    const onData = (data: Buffer) => {
      // ── SGR extended format (preferred, all modern terminals) ──────────────
      // Sequence: \x1b[<Cb;Cx;CyM  (or lowercase m for release)
      // Any SGR mouse sequence → stamp suppression ref to block leaked bytes
      // from reaching the input bar.  Then handle scroll specifically.
      // Button 64 = scroll up, 65 = scroll down.
      // Modifier bits: +4 Shift, +8 Alt, +16 Ctrl — mask them out.
      const str = data.toString();
      const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)[Mm]/g;
      let m: RegExpExecArray | null;
      let hasMouse = false;
      while ((m = sgrRe.exec(str)) !== null) {
        hasMouse = true;
        const btn = parseInt(m[1]!, 10) & ~28; // ~(4|8|16) strips modifier bits
        if (btn === 64) handleMouseScroll("up");
        else if (btn === 65) handleMouseScroll("down");
      }

      // ── X10 fallback (older terminals, some tmux configs) ──────────────────
      // Sequence: ESC M + 3 raw bytes: btn+32, col+32, row+32
      // Scroll up btn byte = 64+32 = 96, scroll down = 65+32 = 97
      for (let i = 0; i + 3 < data.length; i++) {
        if (data[i] === 0x1b && data[i + 1] === 0x4d) { // ESC M
          hasMouse = true;
          const btn = data[i + 2]!;
          if (btn === 96) handleMouseScroll("up");
          else if (btn === 97) handleMouseScroll("down");
          i += 3; // skip the full 3-byte payload
        }
      }

      // Stamp suppression ref for ANY mouse event (clicks, releases, scroll).
      // handleMouseScroll already stamps it for scroll, but clicks need it too.
      if (hasMouse) lastMouseEventRef.current = Date.now();
    };

    process.stdin.on("data", onData);

    return () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
      process.stdin.off("data", onData);
    };
  }, [handleMouseScroll]);

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
  const canKeyboardScroll =
    suggestions.length === 0 && inputValue.length === 0;

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

    // Suppress input for 120ms after a mouse scroll event.
    // Mouse scroll sequences (e.g. SGR \x1b[<65;X;YM, X10 ESC M + bytes) contain
    // printable ASCII characters that pass the sanitizer — this gate blocks them.
    if (Date.now() - lastMouseEventRef.current < 120) return;

    // Regular character — sanitize to strip any remaining leaked control bytes
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
        projectName={PROJECT_NAME}
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

import { Box, useApp, useInput, useStdout } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSlashSuggestions } from "../tui/components/InputBar";
import useAgent from "../tui/hooks/useAgent";
import { ChromeBar } from "./components/ChromeBar";
import { Composer } from "./components/Composer";
import { TranscriptView } from "./components/TranscriptView";
import {
  parseTerminalMouseActions,
  sanitizeComposerInput,
} from "./input";
import { formatTranscriptRows } from "./formatTranscript";

const MOUSE_WHEEL_SCROLL_LINES = 3;
const MOUSE_PACKET_SUPPRESSION_MS = 48;
const EMPTY_PLACEHOLDER = "Ask TE UI v3 to run the agent…";

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 30);
  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevRenderedRowCountRef = useRef(0);
  const suppressNextInkInputRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    log,
    stats,
    busy,
    savedChats,
    submit,
    resume,
    handleCommand,
    abortCurrentRun,
  } = useAgent();

  useEffect(() => {
    if (!stdout) {
      return;
    }

    const onResize = () => {
      setTermWidth(stdout.columns);
      setTermHeight(stdout.rows);
    };

    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  const suggestions = useMemo(
    () => getSlashSuggestions(inputValue, savedChats),
    [inputValue, savedChats],
  );

  useEffect(() => {
    setSelectedSuggestion((current) => {
      if (suggestions.length === 0) {
        return 0;
      }

      return Math.min(current, suggestions.length - 1);
    });
  }, [suggestions]);

  const transcriptRows = useMemo(
    () => formatTranscriptRows(log, Math.max(48, termWidth - 2)),
    [log, termWidth],
  );

  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  const chromeHeight = 3;
  const composerHeight = 4 + suggestionsHeight;
  const transcriptHeight = Math.max(8, termHeight - chromeHeight - composerHeight);
  const maxScrollOffset = Math.max(0, transcriptRows.length - transcriptHeight);
  const pageScrollAmount = Math.max(1, Math.floor(transcriptHeight * 0.8));

  useEffect(() => {
    const added = transcriptRows.length - prevRenderedRowCountRef.current;
    if (added > 0 && scrollOffset > 0) {
      setScrollOffset((current) => Math.min(maxScrollOffset, current + added));
    }
    prevRenderedRowCountRef.current = transcriptRows.length;
  }, [maxScrollOffset, scrollOffset, transcriptRows.length]);

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset));
  }, [maxScrollOffset]);

  useEffect(() => {
    process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");

    const onData = (buf: Buffer) => {
      const payload = buf.toString("binary");
      const mouseActions = parseTerminalMouseActions(payload);

      if (mouseActions.length === 0) {
        return;
      }

      suppressNextInkInputRef.current = true;
      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
      }
      suppressTimeoutRef.current = setTimeout(() => {
        suppressNextInkInputRef.current = false;
        suppressTimeoutRef.current = null;
      }, MOUSE_PACKET_SUPPRESSION_MS);

      for (const action of mouseActions) {
        if (action === "scroll-up") {
          setScrollOffset((current) =>
            Math.min(maxScrollOffset, current + MOUSE_WHEEL_SCROLL_LINES),
          );
        } else if (action === "scroll-down") {
          setScrollOffset((current) =>
            Math.max(0, current - MOUSE_WHEEL_SCROLL_LINES),
          );
        }
      }
    };

    process.stdin.on("data", onData);
    return () => {
      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }
      suppressNextInkInputRef.current = false;
      process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
      process.stdin.off("data", onData);
    };
  }, [maxScrollOffset]);

  const resetComposer = () => {
    setInputValue("");
    setSelectedSuggestion(0);
  };

  const executeSuggestion = () => {
    const selected = suggestions[selectedSuggestion];
    if (!selected) {
      return false;
    }

    setScrollOffset(0);
    if (selected.kind === "session" && selected.chatId) {
      resume(selected.chatId);
    } else {
      const normalized = selected.name.replace(/^\//, "");
      const [cmdName, ...rest] = normalized.trim().split(" ");
      handleCommand(cmdName ?? "", rest.join(" "));
    }

    resetComposer();
    return true;
  };

  const canKeyboardScroll =
    !busy &&
    !inputValue &&
    suggestions.length === 0;

  useInput((input, key) => {
    const isSubmitKey = key.return || input === "\r" || input === "\n";

    if (key.ctrl && input === "c") {
      if (busy) {
        abortCurrentRun("keyboard");
      } else {
        exit();
      }
      return;
    }

    if (key.escape) {
      if (inputValue) {
        resetComposer();
      } else if (busy) {
        abortCurrentRun("keyboard");
      }
      return;
    }

    if (key.tab) {
      if (suggestions.length > 0) {
        const selected = suggestions[selectedSuggestion];
        if (selected?.kind === "session" && selected.chatId) {
          setInputValue(`/resume ${selected.chatId}`);
        } else if (selected) {
          setInputValue(`${selected.name} `);
        }
        setSelectedSuggestion(0);
      }
      return;
    }

    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((current) =>
          current === 0 ? suggestions.length - 1 : current - 1,
        );
      } else if (canKeyboardScroll) {
        setScrollOffset((current) => Math.min(maxScrollOffset, current + 1));
      }
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((current) =>
          current === suggestions.length - 1 ? 0 : current + 1,
        );
      } else if (canKeyboardScroll) {
        setScrollOffset((current) => Math.max(0, current - 1));
      }
      return;
    }

    if (input === "k" && canKeyboardScroll) {
      setScrollOffset((current) => Math.min(maxScrollOffset, current + 1));
      return;
    }

    if (input === "j" && canKeyboardScroll) {
      setScrollOffset((current) => Math.max(0, current - 1));
      return;
    }

    if (key.pageUp && canKeyboardScroll) {
      setScrollOffset((current) =>
        Math.min(maxScrollOffset, current + pageScrollAmount),
      );
      return;
    }

    if (key.pageDown && canKeyboardScroll) {
      setScrollOffset((current) => Math.max(0, current - pageScrollAmount));
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

    if (suppressNextInkInputRef.current) {
      return;
    }

    if (isSubmitKey) {
      if (suggestions.length > 0) {
        executeSuggestion();
        return;
      }

      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }

      setScrollOffset(0);
      if (trimmed.startsWith("/")) {
        const [cmdName, ...rest] = trimmed.slice(1).split(" ");
        handleCommand(cmdName ?? "", rest.join(" "));
      } else if (!busy) {
        void submit(trimmed);
      } else {
        return;
      }

      resetComposer();
      return;
    }

    if (busy) {
      return;
    }

    if (key.backspace || (key.ctrl && input?.toLowerCase() === "h")) {
      setInputValue((current) => current.slice(0, -1));
      setSelectedSuggestion(0);
      return;
    }

    if (
      key.leftArrow ||
      key.rightArrow ||
      key.upArrow ||
      key.downArrow ||
      key.pageUp ||
      key.pageDown ||
      key.home ||
      key.end ||
      key.delete ||
      key.tab
    ) {
      return;
    }

    const composerInput = sanitizeComposerInput(input);
    if (composerInput && !key.ctrl && !key.meta) {
      setInputValue((current) => `${current}${composerInput}`);
      setSelectedSuggestion(0);
    }
  });

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
        placeholder={EMPTY_PLACEHOLDER}
        suggestions={suggestions}
        selectedSuggestionIdx={selectedSuggestion}
        stats={stats}
      />
    </Box>
  );
}

import path from "node:path";
import { Box, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildLoginUrl } from "@santra/shared";
import { Composer } from "./components/Composer";
import { TranscriptView } from "./components/TranscriptView";
import { ChromeBar } from "./components/ChromeBar";
import { WelcomeState } from "./components/WelcomeState";
import { SetupFlow } from "./components/SetupFlow";
import { LoginGate } from "./components/LoginGate";
import { formatLogTranscriptRows } from "./formatLogTranscript";
import useAgent from "./hooks/useAgent";
import { getSlashSuggestions, sanitizeComposerInput } from "./input";
import type { LogEntry } from "./types.ts";
import type { TranscriptRow } from "./transcript.ts";
import { authExists, writeAuthState } from "../utils/auth.ts";
import {
  getDefaultHostedConfig,
  PROVIDER_LABELS,
  readConfig,
  readTrialState,
  usingHostedAccess,
} from "../utils/config.ts";

const PLACEHOLDER = "Ask the agent anything… (/ for commands)";
const MOUSE_SCROLL_LINES = 3;
const LOGIN_POLL_INTERVAL_MS = 5000;
const LOGIN_POLL_MAX_MS = 10 * 60 * 1000;
type InteractionMode = "scroll" | "select";
type LoginState = {
  token: string;
  url: string;
  opened: boolean;
};

// Derived once at module load — never changes during a session
const PROJECT_NAME = path.basename(process.cwd());

function renderRowText(row: TranscriptRow): string {
  const before = row.before.map((segment) => segment.text).join("");
  const indicator = row.indicator
    ? row.indicator.kind === "icon"
      ? row.indicator.text
      : "…"
    : "";
  const after = row.after.map((segment) => segment.text).join("");
  return `${before}${indicator}${after}`.replace(/\s+$/, "");
}

function copyToClipboard(text: string): boolean {
  const commands =
    process.platform === "darwin"
      ? [["pbcopy"]]
      : process.platform === "win32"
        ? [["clip"]]
        : [
            ["wl-copy"],
            ["xclip", "-selection", "clipboard"],
            ["xsel", "--clipboard", "--input"],
          ];

  for (const cmd of commands) {
    const proc = Bun.spawnSync({
      cmd,
      stdin: new TextEncoder().encode(text),
      stdout: "ignore",
      stderr: "ignore",
    });
    if (proc.exitCode === 0) return true;
  }

  return false;
}

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // ─── Setup flow ───────────────────────────────────────────────────────────
  const [showSetup, setShowSetup] = useState(false);
  const [loginState, setLoginState] = useState<LoginState | null>(null);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

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
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  const openLoginUrl = useCallback((url: string): boolean => {
    const commands =
      process.platform === "darwin"
        ? [["open", url]]
        : process.platform === "win32"
          ? [["cmd", "/c", "start", "", url]]
          : [["xdg-open", url]];

    for (const cmd of commands) {
      const result = Bun.spawnSync({
        cmd,
        stdout: "ignore",
        stderr: "ignore",
      });
      if (result.exitCode === 0) return true;
    }

    return false;
  }, []);

  const getBaseAuthApiUrl = useCallback(() => {
    const loginUrl = buildLoginUrl("dummy");
    return loginUrl.replace(/\/login\/dummy$/, "/api/v1/login-sessions");
  }, []);

  const beginLoginFlow = useCallback(
    async (reuseExisting = false, autoOpen = true) => {
      if (reuseExisting && loginState) {
        const reopened = openLoginUrl(loginState.url);
        setLoginState((current) =>
          current
            ? { ...current, opened: current.opened || reopened }
            : current,
        );
        return;
      }

      const token = crypto.randomUUID();
      const apiUrl = getBaseAuthApiUrl();

      // Register the session on the central server
      try {
        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch (err) {
        setCumulativeLog((prev) => [
          ...prev,
          {
            id: `login-err-${Date.now()}`,
            time: new Date().toTimeString().slice(0, 8),
            level: "error" as const,
            message:
              "Could not connect to authentication server. Check your connection.",
          },
        ]);
        return;
      }

      const url = buildLoginUrl(token);
      const opened = autoOpen ? openLoginUrl(url) : false;
      setLoginState({
        token,
        url,
        opened,
      });
    },
    [loginState, openLoginUrl, getBaseAuthApiUrl],
  );

  useEffect(() => {
    if (!loginState) {
      if (loginPollRef.current !== undefined) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = undefined;
      }
      return;
    }

    const startedAt = Date.now();

    loginPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > LOGIN_POLL_MAX_MS) {
        if (loginPollRef.current !== undefined) {
          clearInterval(loginPollRef.current);
          loginPollRef.current = undefined;
        }
        setLoginState(null);
        setCumulativeLog((prev) => [
          ...prev,
          {
            id: `login-timeout-${Date.now()}`,
            time: new Date().toTimeString().slice(0, 8),
            level: "info" as const,
            message: "Login timed out. Run /login to try again.",
          },
        ]);
        return;
      }

      try {
        const apiUrl = getBaseAuthApiUrl();
        const response = await fetch(`${apiUrl}/${loginState.token}`);
        if (!response.ok) return;

        const session = (await response.json()) as {
          status: string;
          provider?: string;
        };
        if (session.status !== "completed" || !session.provider) return;

        writeAuthState({
          version: 1,
          provider: session.provider as any,
          authenticatedAt: Date.now(),
        });

        setLoginState(null);
        setCumulativeLog((prev) => [
          ...prev,
          {
            id: `login-complete-${Date.now()}`,
            time: new Date().toTimeString().slice(0, 8),
            level: "ok" as const,
            message: "Connected Santra CLI.",
          },
        ]);
      } catch (err) {
        // Silently retry polling
      }
    }, LOGIN_POLL_INTERVAL_MS);

    return () => {
      if (loginPollRef.current !== undefined) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = undefined;
      }
    };
  }, [loginState]);

  // ─── Agent runtime ────────────────────────────────────────────────────────
  const {
    log,
    tasks,
    stats,
    busy,
    savedChats,
    pendingApproval,
    pendingQuestion,
    submit,
    resume,
    clearLog,
    handleCommand,
    abortCurrentRun,
    resolveApproval,
    resolveQuestion,
  } = useAgent();

  // ─── Cumulative log (accumulates finished runs within this session) ───────
  // useAgent resets its log on each new submit(); we persist completed runs
  // here so the transcript shows full conversation history.
  const [cumulativeLog, setCumulativeLog] = useState<LogEntry[]>([
    {
      id: "welcome",
      time: new Date().toTimeString().slice(0, 8),
      level: "info" as const,
      message: `santra  ·  ${PROJECT_NAME}`,
    },
  ]);
  const logRef = useRef<LogEntry[]>(log);
  logRef.current = log;

  const prevBusyRef = useRef(false);
  useEffect(() => {
    if (prevBusyRef.current && !busy) {
      // A run just finished — absorb its log into cumulative history
      const finished = logRef.current;
      if (finished.length > 0) {
        setCumulativeLog((prev) => {
          const sep: LogEntry[] =
            prev.length > 0
              ? [
                  {
                    id: `divider-${Date.now()}`,
                    time: finished[0]?.time ?? "",
                    level: "info" as const,
                    message:
                      "──────────────────────────────────────────────────",
                  },
                ]
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

  // Active display: cumulative runs + current run (if in progress)
  const displayLog = useMemo(
    () => [...cumulativeLog, ...log],
    [cumulativeLog, log],
  );

  const welcomeAccessState = useMemo(() => {
    const config = readConfig() ?? getDefaultHostedConfig();
    const hosted = usingHostedAccess(config);
    const providerName = PROVIDER_LABELS[config.provider] ?? config.provider;

    return {
      providerLabel: hosted
        ? `${providerName} · Santra hosted`
        : `${providerName} · BYOK`,
      recommendation: hosted
        ? "Run /setup and choose BYOK for your own provider key."
        : "You're using your own provider key.",
      remainingTokensLabel: hosted
        ? readTrialState().remainingTokens.toLocaleString()
        : undefined,
    };
  }, [busy, log.length, showSetup, loginState]);

  // ─── Input state ──────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [approvalFeedbackMode, setApprovalFeedbackMode] = useState(false);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("scroll");

  const suggestions = useMemo(
    () => getSlashSuggestions(inputValue, savedChats),
    [inputValue, savedChats],
  );

  useEffect(() => {
    if (!pendingApproval) {
      setApprovalFeedbackMode(false);
    }
  }, [pendingApproval]);

  useEffect(() => {
    if (!pendingQuestion) {
      setInputValue("");
    }
  }, [pendingQuestion]);

  useEffect(() => {
    setSelectedSuggestion((c) =>
      suggestions.length === 0 ? 0 : Math.min(c, suggestions.length - 1),
    );
  }, [suggestions]);

  const resetComposer = () => {
    setInputValue("");
    setSelectedSuggestion(0);
    setApprovalFeedbackMode(false);
  };

  // ─── Transcript rows ──────────────────────────────────────────────────────
  const contentRows = useMemo(() => {
    const width = Math.max(48, termWidth - 2);
    return formatLogTranscriptRows(displayLog, width);
  }, [displayLog, termWidth]);

  const transcriptRows = contentRows;

  // Intercept /clear to also wipe cumulative history
  const handleCommandV4 = useCallback(
    (cmd: string, arg?: string) => {
      if (cmd === "setup") {
        if (!authExists()) {
          beginLoginFlow(false, false);
          setCumulativeLog((prev) => [
            ...prev,
            {
              id: `setup-login-${Date.now()}`,
              time: new Date().toTimeString().slice(0, 8),
              level: "info" as const,
              message:
                "Sign in first. After login completes, run /setup again.",
            },
          ]);
          return;
        }
        setLoginState(null);
        setShowSetup(true);
        return;
      }

      if (cmd === "login") {
        beginLoginFlow(false, true);
        return;
      }

      if (cmd === "clear") {
        clearAll();
        return;
      }

      if (cmd === "copy") {
        const transcriptText = transcriptRows
          .map((row) => renderRowText(row))
          .filter((line) => line.trim().length > 0)
          .join("\n");

        const message = copyToClipboard(transcriptText)
          ? "Copied transcript to clipboard."
          : "Could not copy transcript automatically. Drag to select text and copy from the terminal.";

        setCumulativeLog((prev) => [
          ...prev,
          {
            id: `copy-${Date.now()}`,
            time: new Date().toTimeString().slice(0, 8),
            level: message.startsWith("Copied")
              ? ("ok" as const)
              : ("error" as const),
            message,
          },
        ]);
        return;
      }

      if (cmd === "help") {
        handleCommand(cmd, arg);
        setCumulativeLog((prev) => [
          ...prev,
          {
            id: `help-copy-${Date.now()}`,
            time: new Date().toTimeString().slice(0, 8),
            level: "info" as const,
            message:
              "/copy  copy transcript  ·  /setup configure provider  ·  /login open auth link",
          },
        ]);
        return;
      }

      handleCommand(cmd, arg);
    },
    [beginLoginFlow, clearAll, handleCommand, transcriptRows],
  );

  // ─── Scroll state ─────────────────────────────────────────────────────────
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevRowCountRef = useRef(0);
  const maxScrollOffsetRef = useRef(0);
  const lastMouseEventRef = useRef(0);

  const suggestionsHeight = suggestions.length > 0 ? suggestions.length + 3 : 0;
  const chromeHeight = 3;
  const composerHeight = 5 + suggestionsHeight; // 4 composer + 1 padding above it
  const transcriptHeight = Math.max(
    8,
    termHeight - chromeHeight - composerHeight - 1,
  );
  const scrollViewportHeight = Math.max(1, transcriptHeight);
  const maxScrollOffset = Math.max(
    0,
    transcriptRows.length - scrollViewportHeight,
  );
  const pageScrollAmount = Math.max(1, Math.floor(scrollViewportHeight * 0.8));
  maxScrollOffsetRef.current = maxScrollOffset;

  // Bump offset when new rows arrive while user is scrolled up
  useEffect(() => {
    const added = transcriptRows.length - prevRowCountRef.current;
    if (!busy && added > 0 && scrollOffset > 0) {
      setScrollOffset((c) => Math.min(maxScrollOffset, c + added));
    }
    prevRowCountRef.current = transcriptRows.length;
  }, [busy, maxScrollOffset, scrollOffset, transcriptRows.length]);

  // While a run is active, always follow the live tail so status/next rows stay visible.
  useEffect(() => {
    if (!busy) return;
    if (scrollOffset !== 0) {
      setScrollOffset(0);
    }
  }, [busy, scrollOffset, transcriptRows.length]);

  // Clamp offset when content shrinks
  useEffect(() => {
    setScrollOffset((c) => Math.min(c, maxScrollOffset));
  }, [maxScrollOffset]);

  const toggleInteractionMode = useCallback(() => {
    setInteractionMode((current) => {
      const next: InteractionMode = current === "scroll" ? "select" : "scroll";
      return next;
    });
  }, []);

  const handleMouseScroll = useCallback((direction: "up" | "down") => {
    lastMouseEventRef.current = Date.now();
    if (direction === "up") {
      setScrollOffset((current) =>
        Math.min(maxScrollOffsetRef.current, current + MOUSE_SCROLL_LINES),
      );
    } else {
      setScrollOffset((current) => Math.max(0, current - MOUSE_SCROLL_LINES));
    }
  }, []);

  // ─── Terminal interaction mode ───────────────────────────────────────────
  useEffect(() => {
    if (!process.stdin.isTTY) return;

    const enableScrollMode = () => {
      process.stdout.write("\x1b[?1000h\x1b[?1006h");
    };

    const enableSelectMode = () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
    };

    if (showSetup || loginState) {
      enableSelectMode();
    } else if (interactionMode === "scroll") {
      enableScrollMode();
    } else {
      enableSelectMode();
    }

    const onData = (data: Buffer) => {
      const str = data.toString();

      if (str.includes("\x1bOQ") || str.includes("\x1b[12~")) {
        toggleInteractionMode();
        return;
      }

      if (showSetup || loginState || interactionMode !== "scroll") return;

      const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)[Mm]/g;
      let match: RegExpExecArray | null;
      let hasMouse = false;

      while ((match = sgrRe.exec(str)) !== null) {
        hasMouse = true;
        const btn = parseInt(match[1]!, 10) & ~28;
        if (btn === 64) handleMouseScroll("up");
        else if (btn === 65) handleMouseScroll("down");
      }

      for (let i = 0; i + 3 < data.length; i++) {
        if (data[i] === 0x1b && data[i + 1] === 0x4d) {
          hasMouse = true;
          const btn = data[i + 2]!;
          if (btn === 96) handleMouseScroll("up");
          else if (btn === 97) handleMouseScroll("down");
          i += 3;
        }
      }

      if (hasMouse) lastMouseEventRef.current = Date.now();
    };

    process.stdin.on("data", onData);

    return () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
      process.stdin.off("data", onData);
    };
  }, [
    handleMouseScroll,
    interactionMode,
    loginState,
    showSetup,
    toggleInteractionMode,
  ]);

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
  const canKeyboardScroll = suggestions.length === 0 && inputValue.length === 0;

  useInput((input, key) => {
    if (input === "\x1bOQ" || input === "\x1b[12~") {
      toggleInteractionMode();
      return;
    }

    if (key.ctrl && input === "c") {
      if (busy) abortCurrentRun("keyboard");
      else exit();
      return;
    }

    if (showSetup) {
      return;
    }

    if (loginState) {
      if (!key.ctrl && !key.meta && (input === "o" || input === "O")) {
        beginLoginFlow(true);
        return;
      }

      return;
    }

    if (pendingQuestion) {
      if (key.escape) {
        if (inputValue) {
          setInputValue("");
        }
        return;
      }

      if (
        key.backspace ||
        key.delete ||
        input === "\u007f" ||
        input === "\b" ||
        (key.ctrl && input?.toLowerCase() === "h")
      ) {
        setInputValue((c) => c.slice(0, -1));
        return;
      }

      if (key.return || input === "\r" || input === "\n") {
        const answer = inputValue.trim();
        if (answer) {
          resolveQuestion(answer);
          resetComposer();
        }
        return;
      }

      const composerInput = sanitizeComposerInput(input);
      if (composerInput && !key.ctrl && !key.meta) {
        setInputValue((c) => `${c}${composerInput}`);
      }
      return;
    }

    if (pendingApproval) {
      if (key.escape) {
        if (inputValue) resetComposer();
        return;
      }

      if (
        key.backspace ||
        key.delete ||
        input === "\u007f" ||
        input === "\b" ||
        (key.ctrl && input?.toLowerCase() === "h")
      ) {
        setInputValue((c) => c.slice(0, -1));
        return;
      }

      if (key.return || input === "\r" || input === "\n") {
        const feedback = inputValue.trim();
        if (feedback && approvalFeedbackMode) {
          resolveApproval("feedback", feedback);
          resetComposer();
        }
        return;
      }

      if (!key.ctrl && !key.meta) {
        if (input === "y" || input === "Y") {
          resolveApproval("allow");
          resetComposer();
          return;
        }
        if (input === "a") {
          resolveApproval("allow_all");
          resetComposer();
          return;
        }
        if (input === "r" || input === "R") {
          resolveApproval("reject");
          resetComposer();
          return;
        }
        if (input === "f" || input === "F") {
          setApprovalFeedbackMode(true);
          setInputValue("");
          return;
        }
      }

      const composerInput = sanitizeComposerInput(input);
      if (composerInput && !key.ctrl && !key.meta) {
        if (!approvalFeedbackMode) {
          setApprovalFeedbackMode(true);
        }
        setInputValue((c) => `${c}${composerInput}`);
      }
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
        setSelectedSuggestion((c) =>
          c === 0 ? suggestions.length - 1 : c - 1,
        );
      } else if (canKeyboardScroll) {
        setScrollOffset((c) => Math.min(maxScrollOffset, c + 1));
      }
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion((c) =>
          c === suggestions.length - 1 ? 0 : c + 1,
        );
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

    if (Date.now() - lastMouseEventRef.current < 120) return;

    // Regular character — sanitize to strip any remaining leaked control bytes
    const composerInput = sanitizeComposerInput(input);
    if (composerInput && !key.ctrl && !key.meta) {
      setInputValue((c) => `${c}${composerInput}`);
      setSelectedSuggestion(0);
    }
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  const isWelcomeState =
    displayLog.length === 1 && displayLog[0]?.id === "welcome" && !busy;

  if (showSetup) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <SetupFlow onComplete={() => setShowSetup(false)} />
      </Box>
    );
  }

  if (loginState) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <ChromeBar
          width={termWidth}
          scrollOffset={0}
          hiddenRowsAbove={0}
          projectName={PROJECT_NAME}
          interactionMode={interactionMode}
        />
        <LoginGate
          width={termWidth}
          height={scrollViewportHeight}
          url={loginState.url}
          opened={loginState.opened}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <ChromeBar
        width={termWidth}
        scrollOffset={scrollOffset}
        hiddenRowsAbove={Math.min(maxScrollOffset, scrollOffset)}
        projectName={PROJECT_NAME}
        interactionMode={interactionMode}
      />
      {isWelcomeState ? (
        <WelcomeState
          width={termWidth}
          height={scrollViewportHeight}
          providerLabel={welcomeAccessState.providerLabel}
          recommendation={welcomeAccessState.recommendation}
          remainingTokensLabel={welcomeAccessState.remainingTokensLabel}
        />
      ) : (
        <TranscriptView
          rows={transcriptRows}
          width={termWidth}
          height={scrollViewportHeight}
          scrollOffset={scrollOffset}
        />
      )}
      <Box paddingTop={1} width={termWidth}>
        <Composer
          value={inputValue}
          busy={busy}
          placeholder={PLACEHOLDER}
          suggestions={suggestions}
          selectedSuggestionIdx={selectedSuggestion}
          stats={stats}
          width={termWidth}
          pendingApproval={pendingApproval}
          pendingQuestion={pendingQuestion}
          approvalFeedbackMode={approvalFeedbackMode}
        />
      </Box>
    </Box>
  );
}

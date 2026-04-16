import { useCallback, useEffect, useReducer, useRef } from "react";
import { DEFAULT_TOTAL_STEPS, buildMockScenario, formatClock } from "./mockScenario";

import type {
  ComposerState,
  DividerItem,
  MockRunStats,
  MockRunStep,
  MockTerminalState,
  MockTranscriptItem,
  PhaseItem,
  ResponseItem,
  ThinkingItem,
  ToolItem,
} from "./types";

const DEFAULT_PLACEHOLDER = "Ask TE UI v3 to mock an agent run…";
const DEFAULT_MODEL = "gpt-5.4-mini";
const INITIAL_HISTORY_SEEDS = [
  {
    prompt: "Mirror Codebuff's transcript shell in TE UI v3.",
    startedAt: new Date(2026, 3, 15, 9, 12, 8),
  },
  {
    prompt: "Stress-test long history scrolling with a sticky composer.",
    startedAt: new Date(2026, 3, 15, 9, 19, 42),
  },
  {
    prompt: "Replay a deterministic mock run with thinking and tool rows.",
    startedAt: new Date(2026, 3, 15, 9, 27, 11),
  },
  {
    prompt: "Keep older runs visible while following the latest output.",
    startedAt: new Date(2026, 3, 15, 9, 34, 39),
  },
  {
    prompt: "Stay Ink-only for v1 and seed enough history to force scrolling.",
    startedAt: new Date(2026, 3, 15, 9, 42, 5),
  },
] as const;

export type MockTerminalAction =
  | { type: "composer.set"; value: string }
  | { type: "composer.clear" }
  | { type: "submit"; prompt: string; runId: number; timestamp: string; totalSteps: number }
  | { type: "apply_step"; runId: number; step: MockRunStep }
  | { type: "tick_elapsed"; runId: number }
  | { type: "finish_run"; runId: number }
  | { type: "scroll.by"; delta: number; maxOffset: number }
  | { type: "scroll.bump"; delta: number; maxOffset: number }
  | { type: "scroll.to"; offset: number; maxOffset: number };

export function createInitialStats(
  totalSteps: number = DEFAULT_TOTAL_STEPS,
): MockRunStats {
  return {
    model: DEFAULT_MODEL,
    elapsed: 0,
    steps: 0,
    totalSteps,
    toolCalls: 0,
  };
}

export function createInitialComposerState(): ComposerState {
  return {
    value: "",
    busy: false,
    placeholder: DEFAULT_PLACEHOLDER,
  };
}

export function createInitialMockTerminalState(): MockTerminalState {
  return {
    transcript: [],
    stats: createInitialStats(),
    composer: createInitialComposerState(),
    scrollOffset: 0,
    activeRunId: null,
  };
}

function buildCompletedRunSnapshot(runId: number, prompt: string, startedAt: Date) {
  const scenario = buildMockScenario(startedAt);

  let transcript: MockTranscriptItem[] = [
    {
      id: `user-${runId}`,
      kind: "user",
      timestamp: formatClock(startedAt),
      prompt,
    },
  ];
  let stats = createInitialStats(DEFAULT_TOTAL_STEPS);

  for (const step of scenario) {
    const scopedStep: MockRunStep = {
      ...step,
      id: `${runId}:${step.id}`,
    };
    transcript = applyMockRunStep(transcript, scopedStep);
    stats = {
      ...stats,
      ...scopedStep.statsPatch,
    };
  }

  return {
    transcript,
    stats: {
      ...stats,
      elapsed: Math.max(1, Math.ceil(sumScenarioDuration(scenario) / 1000)),
    },
  };
}

export function createSeededMockTerminalState(): MockTerminalState {
  let transcript: MockTranscriptItem[] = [];
  let stats = createInitialStats(DEFAULT_TOTAL_STEPS);

  for (const [index, seed] of INITIAL_HISTORY_SEEDS.entries()) {
    const runId = index + 1;
    const snapshot = buildCompletedRunSnapshot(runId, seed.prompt, seed.startedAt);

    if (transcript.length > 0) {
      transcript.push({
        id: `divider-${runId}`,
        kind: "divider",
        timestamp: formatClock(seed.startedAt),
        label: `Run ${runId}`,
      });
    }

    transcript.push(...snapshot.transcript);
    stats = snapshot.stats;
  }

  return {
    transcript,
    stats,
    composer: createInitialComposerState(),
    scrollOffset: 0,
    activeRunId: null,
  };
}

function upsertTranscriptItem(
  transcript: MockTranscriptItem[],
  nextItem: MockTranscriptItem,
): MockTranscriptItem[] {
  const existingIndex = transcript.findIndex((item) => item.id === nextItem.id);
  if (existingIndex === -1) {
    return [...transcript, nextItem];
  }

  const existing = transcript[existingIndex];
  if (!existing) {
    return transcript;
  }

  let updated: MockTranscriptItem;
  switch (nextItem.kind) {
    case "phase":
      updated = { ...(existing as PhaseItem), ...nextItem };
      break;
    case "thinking":
      updated = { ...(existing as ThinkingItem), ...nextItem };
      break;
    case "tool":
      updated = { ...(existing as ToolItem), ...nextItem };
      break;
    case "response":
      updated = { ...(existing as ResponseItem), ...nextItem };
      break;
    case "divider":
      updated = { ...(existing as DividerItem), ...nextItem };
      break;
    case "user":
      updated = nextItem;
      break;
  }

  return transcript.map((item, index) => (index === existingIndex ? updated : item));
}

export function applyMockRunStep(
  transcript: MockTranscriptItem[],
  step: MockRunStep,
): MockTranscriptItem[] {
  switch (step.kind) {
    case "phase":
      return upsertTranscriptItem(transcript, {
        id: step.id,
        kind: "phase",
        timestamp: step.timestamp,
        title: step.title,
        status: step.status,
      });

    case "thinking":
      return upsertTranscriptItem(transcript, {
        id: step.id,
        kind: "thinking",
        timestamp: step.timestamp,
        label: step.label,
        content: step.content,
        status: step.status,
      });

    case "tool":
      return upsertTranscriptItem(transcript, {
        id: step.id,
        kind: "tool",
        timestamp: step.timestamp,
        title: step.title,
        detail: step.detail,
        status: step.status,
      });

    case "response": {
      const existing = transcript.find((item) => item.id === step.id);
      const currentContent =
        existing?.kind === "response" ? existing.content : "";
      return upsertTranscriptItem(transcript, {
        id: step.id,
        kind: "response",
        timestamp: step.timestamp,
        content: step.append ? `${currentContent}${step.content}` : step.content,
        status: step.status,
      });
    }
  }
}

export function mockTerminalReducer(
  state: MockTerminalState,
  action: MockTerminalAction,
): MockTerminalState {
  switch (action.type) {
    case "composer.set":
      return {
        ...state,
        composer: {
          ...state.composer,
          value: action.value,
        },
      };

    case "composer.clear":
      return {
        ...state,
        composer: {
          ...state.composer,
          value: "",
        },
      };

    case "submit":
      return {
        transcript: [
          ...state.transcript,
          ...(state.transcript.length > 0
            ? [
                {
                  id: `divider-${action.runId}`,
                  kind: "divider" as const,
                  timestamp: action.timestamp,
                  label: `Run ${action.runId}`,
                },
              ]
            : []),
          {
            id: `user-${action.runId}`,
            kind: "user",
            timestamp: action.timestamp,
            prompt: action.prompt,
          },
        ],
        stats: createInitialStats(action.totalSteps),
        composer: {
          ...state.composer,
          value: "",
          busy: true,
        },
        scrollOffset: 0,
        activeRunId: action.runId,
      };

    case "apply_step": {
      if (state.activeRunId !== action.runId) {
        return state;
      }
      const scopedStep: MockRunStep = {
        ...action.step,
        id: `${action.runId}:${action.step.id}`,
      };
      return {
        ...state,
        transcript: applyMockRunStep(state.transcript, scopedStep),
        stats: {
          ...state.stats,
          ...scopedStep.statsPatch,
        },
      };
    }

    case "tick_elapsed":
      if (state.activeRunId !== action.runId || !state.composer.busy) {
        return state;
      }
      return {
        ...state,
        stats: {
          ...state.stats,
          elapsed: state.stats.elapsed + 1,
        },
      };

    case "finish_run":
      if (state.activeRunId !== action.runId) {
        return state;
      }
      return {
        ...state,
        composer: {
          ...state.composer,
          busy: false,
        },
        activeRunId: null,
      };

    case "scroll.by":
      return {
        ...state,
        scrollOffset: Math.max(
          0,
          Math.min(action.maxOffset, state.scrollOffset + action.delta),
        ),
      };

    case "scroll.bump":
      if (state.scrollOffset === 0 || action.delta <= 0) {
        return state;
      }
      return {
        ...state,
        scrollOffset: Math.max(
          0,
          Math.min(action.maxOffset, state.scrollOffset + action.delta),
        ),
      };

    case "scroll.to":
      return {
        ...state,
        scrollOffset: Math.max(0, Math.min(action.maxOffset, action.offset)),
      };
  }
}

function sumScenarioDuration(steps: MockRunStep[]): number {
  return steps.reduce((total, step) => total + step.delayMs, 0);
}

export function useMockTerminalController() {
  const [state, dispatch] = useReducer(
    mockTerminalReducer,
    undefined,
    createSeededMockTerminalState,
  );

  const runIdRef = useRef(INITIAL_HISTORY_SEEDS.length + 1);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRenderedRowCountRef = useRef(0);

  const clearPlaybackTimers = useCallback(() => {
    timeoutRefs.current.forEach((timer) => clearTimeout(timer));
    timeoutRefs.current = [];

    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  useEffect(() => clearPlaybackTimers, [clearPlaybackTimers]);

  const setComposerValue = useCallback(
    (value: string) => dispatch({ type: "composer.set", value }),
    [],
  );

  const clearComposer = useCallback(
    () => dispatch({ type: "composer.clear" }),
    [],
  );

  const scrollBy = useCallback(
    (delta: number, maxOffset: number) =>
      dispatch({ type: "scroll.by", delta, maxOffset }),
    [],
  );

  const scrollTo = useCallback(
    (offset: number, maxOffset: number) =>
      dispatch({ type: "scroll.to", offset, maxOffset }),
    [],
  );

  const handleRenderedRowCount = useCallback(
    (rowCount: number, viewportHeight: number) => {
      const added = rowCount - prevRenderedRowCountRef.current;
      const maxOffset = Math.max(0, rowCount - viewportHeight);
      if (added > 0 && state.scrollOffset > 0) {
        dispatch({ type: "scroll.bump", delta: added, maxOffset });
      }
      prevRenderedRowCountRef.current = rowCount;
    },
    [state.scrollOffset],
  );

  const submitPrompt = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || state.composer.busy) {
        return;
      }

      clearPlaybackTimers();

      const runId = runIdRef.current++;
      const startedAt = new Date();
      const scenario = buildMockScenario(startedAt);

      dispatch({
        type: "submit",
        prompt: trimmed,
        runId,
        timestamp: formatClock(startedAt),
        totalSteps: DEFAULT_TOTAL_STEPS,
      });

      elapsedIntervalRef.current = setInterval(() => {
        dispatch({ type: "tick_elapsed", runId });
      }, 1000);

      let cumulativeDelay = 0;
      for (const step of scenario) {
        cumulativeDelay += step.delayMs;
        timeoutRefs.current.push(
          setTimeout(() => {
            dispatch({ type: "apply_step", runId, step });
          }, cumulativeDelay),
        );
      }

      timeoutRefs.current.push(
        setTimeout(() => {
          if (elapsedIntervalRef.current) {
            clearInterval(elapsedIntervalRef.current);
            elapsedIntervalRef.current = null;
          }
          dispatch({ type: "finish_run", runId });
        }, sumScenarioDuration(scenario) + 120),
      );
    },
    [clearPlaybackTimers, state.composer.busy],
  );

  return {
    state,
    clearComposer,
    handleRenderedRowCount,
    scrollBy,
    scrollTo,
    setComposerValue,
    submitPrompt,
  };
}

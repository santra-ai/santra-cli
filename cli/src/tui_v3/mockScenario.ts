import type { MockRunStep } from "./types";

export const DEFAULT_TOTAL_STEPS = 7;

export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function buildMockScenario(baseTime: Date = new Date()): MockRunStep[] {
  let cursor = baseTime.getTime();

  const at = <T extends Omit<MockRunStep, "delayMs" | "timestamp">>(
    delayMs: number,
    fields: T,
  ): T & Pick<MockRunStep, "delayMs" | "timestamp"> => {
    cursor += delayMs;
    return {
      ...fields,
      delayMs,
      timestamp: formatClock(new Date(cursor)),
    };
  };

  return [
    at(280, {
      kind: "phase",
      id: "phase-setup",
      title: "Mapping the terminal shell",
      status: "active",
      statsPatch: { steps: 1 },
    }),
    at(520, {
      kind: "thinking",
      id: "thinking-layout",
      label: "thinking…",
      content:
        "Comparing the current Ink shell with Codebuff's sticky transcript and bottom composer.\nKeeping the prototype deterministic and terminal-only.",
      status: "active",
    }),
    at(700, {
      kind: "thinking",
      id: "thinking-layout",
      label: "thought",
      content:
        "Comparing the current Ink shell with Codebuff's sticky transcript and bottom composer.\nKeeping the prototype deterministic and terminal-only.",
      status: "done",
    }),
    at(420, {
      kind: "tool",
      id: "tool-santra",
      title: "Read cli/src/tui/App.tsx — existing Ink layout",
      status: "active",
      statsPatch: { steps: 2, toolCalls: 1 },
    }),
    at(580, {
      kind: "tool",
      id: "tool-santra",
      title: "Read cli/src/tui/App.tsx",
      detail:
        "Resize-aware shell, bottom-pinned input, and scroll offset preservation patterns.",
      status: "done",
    }),
    at(420, {
      kind: "tool",
      id: "tool-codebuff",
      title: "Inspect Codebuff CLI layout — sticky transcript and composer",
      status: "active",
      statsPatch: { steps: 3, toolCalls: 2 },
    }),
    at(620, {
      kind: "tool",
      id: "tool-codebuff",
      title: "Inspect Codebuff CLI layout",
      detail:
        "OpenTUI scrollbox with a fixed composer; reproduced here with an Ink-only viewport.",
      status: "done",
    }),
    at(360, {
      kind: "phase",
      id: "phase-setup",
      title: "Rendering the prototype transcript",
      status: "done",
      statsPatch: { steps: 4 },
    }),
    at(420, {
      kind: "tool",
      id: "tool-prototype",
      title: "Compose mock run — transcript, chrome, and compact stats",
      status: "active",
      statsPatch: { steps: 5, toolCalls: 3 },
    }),
    at(620, {
      kind: "tool",
      id: "tool-prototype",
      title: "Compose mock run",
      detail:
        "A single canned scenario replays for every prompt; only the echoed prompt changes.",
      status: "done",
    }),
    at(480, {
      kind: "response",
      id: "response-final",
      content:
        "# Prototype Ready\n\n- Sticky composer anchored to the bottom.\n- Mock transcript with thinking and tool activity.\n- Scrollable viewport that stays stable while new rows stream in.",
      status: "active",
      statsPatch: { steps: 6 },
    }),
    at(720, {
      kind: "response",
      id: "response-final",
      append: true,
      content:
        "\n\nUse `Enter` to replay the canned run. Use `Esc` to clear idle input. Use `↑↓` or `j/k` to scroll.",
      status: "done",
      statsPatch: { steps: 7 },
    }),
  ];
}

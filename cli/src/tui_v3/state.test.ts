import { describe, expect, test } from "bun:test";
import {
  applyMockRunStep,
  createInitialMockTerminalState,
  createSeededMockTerminalState,
  mockTerminalReducer,
} from "./state";

import type { MockRunStep } from "./types";

describe("mockTerminalReducer", () => {
  test("submitting a prompt starts playback and appends the user turn", () => {
    const initial = createInitialMockTerminalState();
    const submitted = mockTerminalReducer(initial, {
      type: "submit",
      prompt: "Build the landing page shell",
      runId: 1,
      timestamp: "09:00:00",
      totalSteps: 7,
    });

    expect(submitted.transcript).toHaveLength(1);
    expect(submitted.transcript[0]).toMatchObject({
      kind: "user",
      prompt: "Build the landing page shell",
      timestamp: "09:00:00",
    });
    expect(submitted.composer.busy).toBe(true);
    expect(submitted.composer.value).toBe("");
    expect(submitted.scrollOffset).toBe(0);
    expect(submitted.activeRunId).toBe(1);
  });

  test("a new submit preserves prior transcript history and inserts a divider", () => {
    const initial = createInitialMockTerminalState();
    const submitted = mockTerminalReducer(initial, {
      type: "submit",
      prompt: "First prompt",
      runId: 1,
      timestamp: "09:00:00",
      totalSteps: 7,
    });
    const withTool = mockTerminalReducer(submitted, {
      type: "apply_step",
      runId: 1,
      step: {
        kind: "tool",
        id: "tool-1",
        delayMs: 10,
        timestamp: "09:00:01",
        title: "Inspect current shell",
        status: "done",
      },
    });

    const resubmitted = mockTerminalReducer(withTool, {
      type: "submit",
      prompt: "Second prompt",
      runId: 2,
      timestamp: "09:00:02",
      totalSteps: 7,
    });

    expect(resubmitted.transcript).toHaveLength(4);
    expect(resubmitted.transcript[0]).toMatchObject({
      kind: "user",
      prompt: "First prompt",
    });
    expect(resubmitted.transcript[1]).toMatchObject({
      kind: "tool",
      title: "Inspect current shell",
    });
    expect(resubmitted.transcript[2]).toMatchObject({
      kind: "divider",
      label: "Run 2",
    });
    expect(resubmitted.transcript[3]).toMatchObject({
      kind: "user",
      prompt: "Second prompt",
    });
    expect(resubmitted.activeRunId).toBe(2);
  });

  test("completion steps update stats and finish playback", () => {
    const initial = mockTerminalReducer(createInitialMockTerminalState(), {
      type: "submit",
      prompt: "Replay the prototype",
      runId: 7,
      timestamp: "09:00:00",
      totalSteps: 7,
    });

    const steps: MockRunStep[] = [
      {
        kind: "tool",
        id: "tool-1",
        delayMs: 10,
        timestamp: "09:00:01",
        title: "Inspect Codebuff layout",
        status: "active",
        statsPatch: { steps: 1, toolCalls: 1 },
      },
      {
        kind: "tool",
        id: "tool-1",
        delayMs: 10,
        timestamp: "09:00:02",
        title: "Inspect Codebuff layout",
        detail: "Sticky transcript and bottom composer.",
        status: "done",
      },
      {
        kind: "response",
        id: "response-final",
        delayMs: 10,
        timestamp: "09:00:03",
        content: "Prototype ready.",
        status: "done",
        statsPatch: { steps: 7 },
      },
    ];

    const running = steps.reduce(
      (state, step) =>
        mockTerminalReducer(state, {
          type: "apply_step",
          runId: 7,
          step,
        }),
      initial,
    );

    expect(running.stats.toolCalls).toBe(1);
    expect(running.stats.steps).toBe(7);
    expect(running.transcript).toHaveLength(3);
    expect(running.transcript[1]?.id).toBe("7:tool-1");
    expect(running.transcript[2]?.id).toBe("7:response-final");

    const finished = mockTerminalReducer(running, {
      type: "finish_run",
      runId: 7,
    });

    expect(finished.composer.busy).toBe(false);
    expect(finished.activeRunId).toBeNull();
  });
});

describe("applyMockRunStep", () => {
  test("response append concatenates content onto an existing response item", () => {
    const initial = [
      {
        id: "response-final",
        kind: "response" as const,
        timestamp: "09:00:00",
        content: "Prototype ready.",
        status: "active" as const,
      },
    ];

    const updated = applyMockRunStep(initial, {
      kind: "response",
      id: "response-final",
      delayMs: 10,
      timestamp: "09:00:01",
      content: " Use Enter to replay.",
      append: true,
      status: "done",
    });

    expect(updated[0]).toMatchObject({
      content: "Prototype ready. Use Enter to replay.",
      status: "done",
    });
  });

  test("scroll actions clamp offsets within the available history", () => {
    const initial = createInitialMockTerminalState();
    const scrolledUp = mockTerminalReducer(initial, {
      type: "scroll.by",
      delta: 50,
      maxOffset: 6,
    });
    const scrolledDown = mockTerminalReducer(scrolledUp, {
      type: "scroll.by",
      delta: -10,
      maxOffset: 6,
    });

    expect(scrolledUp.scrollOffset).toBe(6);
    expect(scrolledDown.scrollOffset).toBe(0);
  });

  test("seeded startup state includes completed history before the first submit", () => {
    const seeded = createSeededMockTerminalState();

    expect(seeded.transcript.length).toBeGreaterThan(30);
    expect(seeded.transcript[0]).toMatchObject({
      kind: "user",
      prompt: "Mirror Codebuff's transcript shell in TE UI v3.",
    });
    expect(seeded.transcript.some((item) => item.kind === "divider")).toBe(true);
    expect(seeded.stats.steps).toBe(7);
    expect(seeded.stats.toolCalls).toBe(3);
    expect(seeded.activeRunId).toBeNull();
  });
});

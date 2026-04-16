/**
 * Tests for the unified abort primitive.
 *
 * These tests verify the abort contract without spinning up an Ink app.
 * They test the logic directly via mock AbortControllers.
 */
import { describe, expect, test } from "bun:test";

// ─── Minimal test harness for abort logic ─────────────────────────────────────
// We test the abort behavior by simulating the key parts of useAgent's
// abortCurrentRun() and handleCommand("stop") logic in isolation.

function makeAbortHarness() {
  let controller: AbortController | undefined;
  let abortSource: "slash" | "keyboard" = "slash";
  let abortCallCount = 0;

  function abortCurrentRun(source: "slash" | "keyboard") {
    if (!controller) return; // no-op when no run is active
    abortSource = source;
    controller.abort();
    abortCallCount++;
  }

  function startRun() {
    controller = new AbortController();
    abortCallCount = 0;
  }

  function stopRun() {
    controller = undefined;
  }

  function handleCommandStop(source: "slash" = "slash") {
    if (controller) {
      abortCurrentRun(source);
    }
    // (would push "Agent stopped." log in real hook)
  }

  return {
    get signal() {
      return controller?.signal;
    },
    get abortSource() {
      return abortSource;
    },
    get abortCallCount() {
      return abortCallCount;
    },
    get hasActiveRun() {
      return controller !== undefined;
    },
    abortCurrentRun,
    startRun,
    stopRun,
    handleCommandStop,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("abortCurrentRun", () => {
  test('abortCurrentRun("slash") aborts the active controller', () => {
    const h = makeAbortHarness();
    h.startRun();
    expect(h.signal?.aborted).toBe(false);
    h.abortCurrentRun("slash");
    expect(h.signal?.aborted).toBe(true);
  });

  test('abortCurrentRun("keyboard") aborts the active controller', () => {
    const h = makeAbortHarness();
    h.startRun();
    expect(h.signal?.aborted).toBe(false);
    h.abortCurrentRun("keyboard");
    expect(h.signal?.aborted).toBe(true);
  });

  test("abortCurrentRun when no run is active is a no-op (does not throw)", () => {
    const h = makeAbortHarness();
    // No run started
    expect(() => h.abortCurrentRun("slash")).not.toThrow();
    expect(h.abortCallCount).toBe(0);
  });

  test("abortCurrentRun sets source to slash before abort fires", () => {
    const h = makeAbortHarness();
    h.startRun();
    h.abortCurrentRun("slash");
    expect(h.abortSource).toBe("slash");
  });

  test("abortCurrentRun sets source to keyboard before abort fires", () => {
    const h = makeAbortHarness();
    h.startRun();
    h.abortCurrentRun("keyboard");
    expect(h.abortSource).toBe("keyboard");
  });

  test("handleCommand stop delegates to abortCurrentRun", () => {
    const h = makeAbortHarness();
    h.startRun();
    h.handleCommandStop();
    expect(h.signal?.aborted).toBe(true);
    expect(h.abortCallCount).toBe(1);
  });

  test("handleCommandStop when no run active does not throw", () => {
    const h = makeAbortHarness();
    expect(() => h.handleCommandStop()).not.toThrow();
    expect(h.abortCallCount).toBe(0);
  });

  test("/stop and Esc hit the same abort primitive (same call count)", () => {
    // Verify both paths call abortCurrentRun once each
    const h = makeAbortHarness();

    h.startRun();
    h.handleCommandStop("slash"); // /stop path
    expect(h.abortCallCount).toBe(1);
    expect(h.signal?.aborted).toBe(true);

    // Simulate a second run
    h.stopRun();
    h.startRun();
    h.abortCurrentRun("keyboard"); // Esc path
    expect(h.abortCallCount).toBe(1); // reset per run
    expect(h.signal?.aborted).toBe(true);
  });

  test("aborting twice does not increment call count again", () => {
    // AbortController.abort() is idempotent — second call is a no-op
    const h = makeAbortHarness();
    h.startRun();
    h.abortCurrentRun("slash");
    // After abort the controller ref would be cleared in real hook
    // so calling again would hit the no-op path
    h.stopRun();
    h.abortCurrentRun("keyboard");
    expect(h.abortCallCount).toBe(1); // only counted once
  });
});

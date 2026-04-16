import { describe, expect, test } from "bun:test";
import { deriveLog } from "./deriveLog.ts";
import type { RunEvent } from "./types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
let _id = 0;

function reset() { _seq = 0; _id = 0; }

function evt<T extends Omit<RunEvent, "eventId" | "seq" | "runId" | "timestamp">>(
  fields: T,
): T & { eventId: string; seq: number; runId: string; timestamp: number } {
  return {
    ...fields,
    eventId: `e${++_id}`,
    seq: _seq++,
    runId: "run1",
    timestamp: Date.now(),
  } as T & { eventId: string; seq: number; runId: string; timestamp: number };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("deriveLog", () => {

  test("empty events → empty log", () => {
    reset();
    expect(deriveLog([])).toEqual([]);
  });

  test("run_started alone → empty log (no visible entry)", () => {
    reset();
    const log = deriveLog([evt({ type: "run_started" })]);
    expect(log).toHaveLength(0);
  });

  test("user_message → single user LogEntry", () => {
    reset();
    const log = deriveLog([evt({ type: "user_message", content: "hello" })]);
    expect(log).toHaveLength(1);
    expect(log[0]?.level).toBe("user");
    expect(log[0]?.message).toBe("hello");
  });

  test("agent_started → section entry with finished: false", () => {
    reset();
    const log = deriveLog([evt({ type: "agent_started", agentId: "executor", task: "do stuff" })]);
    expect(log).toHaveLength(1);
    expect(log[0]?.level).toBe("section");
    expect(log[0]?.finished).toBe(false);
    expect(log[0]?.message).toBe("Implementing changes");
  });

  test("tool_call_started → bullet with done: false", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/foo/bar.ts" } }),
    ]);
    const bullet = log.find((e) => e.level === "bullet");
    expect(bullet).toBeDefined();
    expect(bullet?.done).toBe(false);
    expect(bullet?.message).toBe("Reading bar.ts");
  });

  test("tool_call_completed → bullet updated to done: true with result description", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/foo/bar.ts" } }),
      evt({ type: "tool_call_completed", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/foo/bar.ts" }, output: JSON.stringify({ lines: 42, truncated: false }) }),
    ]);
    const bullet = log.find((e) => e.level === "bullet");
    expect(bullet?.done).toBe(true);
    expect(bullet?.message).toBe("Read bar.ts — 42 lines");
  });

  test("tool_call_started without matching completed → bullet stays done: false", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/a.ts" } }),
      evt({ type: "run_interrupted", source: "slash" }),
    ]);
    const bullet = log.find((e) => e.level === "bullet");
    // On interrupt, finalizeAll() marks pending tools as done: true
    expect(bullet?.done).toBe(true);
  });

  test("tool_call with error → failed message + error entry", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/x.ts" } }),
      evt({ type: "tool_call_completed", toolCallId: "tc1", agentId: "executor", name: "read_file", parameters: { path: "/x.ts" }, output: "", error: "File not found" }),
    ]);
    const bullet = log.find((e) => e.level === "bullet");
    expect(bullet?.done).toBe(true);
    expect(bullet?.message).toContain("failed");
    const errEntry = log.find((e) => e.level === "error");
    expect(errEntry?.message).toBe("File not found");
  });

  test("text_delta events in direct BaseAgent path (no agent section) accumulate into stream", () => {
    reset();
    // No agent_started — this is the direct path (simple_chat / direct_answer)
    const log = deriveLog([
      evt({ type: "text_delta", agentId: "unknown", content: "Hello " }),
      evt({ type: "text_delta", agentId: "unknown", content: "world" }),
    ]);
    expect(log).toHaveLength(1);
    expect(log[0]?.level).toBe("stream");
    expect(log[0]?.message).toBe("Hello world");
  });

  test("run_completed upgrades direct-path stream entry to response level", () => {
    reset();
    const log = deriveLog([
      evt({ type: "text_delta", agentId: "unknown", content: "The answer is 42." }),
      evt({ type: "run_completed", finalOutput: "" }),
    ]);
    expect(log[0]?.level).toBe("response");
    expect(log[0]?.message).toBe("The answer is 42.");
  });

  test("text_delta from swarm agent (active section) is suppressed", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "reader", task: "read" }),
      evt({ type: "text_delta", agentId: "reader", content: "I will now call list_directory..." }),
      evt({ type: "text_delta", agentId: "reader", content: "<tool_call>...</tool_call>" }),
      evt({ type: "agent_completed", agentId: "reader", output: "" }),
      evt({ type: "run_completed", finalOutput: "Clean final answer" }),
    ]);
    // No stream entry — swarm deltas suppressed
    const stream = log.find((e) => e.level === "stream");
    expect(stream).toBeUndefined();
    // Final answer shown from run_completed
    const resp = log.find((e) => e.level === "response");
    expect(resp?.message).toBe("Clean final answer");
  });

  test("executor text_delta during active section is suppressed", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "write" }),
      evt({ type: "text_delta", agentId: "executor", content: "Please wait for the tool result..." }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "write_file", parameters: { path: "/a.ts" } }),
      evt({ type: "tool_call_completed", toolCallId: "tc1", agentId: "executor", name: "write_file", parameters: { path: "/a.ts" }, output: '{}' }),
      evt({ type: "agent_completed", agentId: "executor", output: "" }),
      evt({ type: "run_completed", finalOutput: "Done! File written." }),
    ]);
    const stream = log.find((e) => e.level === "stream");
    expect(stream).toBeUndefined();
    expect(log.find((e) => e.level === "response")?.message).toBe("Done! File written.");
  });

  test("run_completed with no stream entry uses finalOutput", () => {
    reset();
    const log = deriveLog([
      evt({ type: "run_completed", finalOutput: "Direct response here." }),
    ]);
    expect(log).toHaveLength(1);
    expect(log[0]?.level).toBe("response");
    expect(log[0]?.message).toBe("Direct response here.");
  });

  test("run_completed strips leaked JSON from direct-path stream entry", () => {
    reset();
    const leaked = JSON.stringify({ direct_answer: "Real answer here" });
    // Direct path (no agent sections) — stream is shown and finalized
    const log = deriveLog([
      evt({ type: "text_delta", agentId: "unknown", content: leaked }),
      evt({ type: "run_completed", finalOutput: "" }),
    ]);
    const resp = log.find((e) => e.level === "response");
    expect(resp?.message).toBe("Real answer here");
  });

  test("run_interrupted finalizes pending bullets (no stream since executor section active)", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "write" }),
      evt({ type: "text_delta", agentId: "executor", content: "Planning text (suppressed)" }),
      evt({ type: "tool_call_started", toolCallId: "tc1", agentId: "executor", name: "write_file", parameters: { path: "/f.ts" } }),
      evt({ type: "run_interrupted", source: "keyboard" }),
    ]);
    // No stream entry (swarm deltas suppressed)
    const lingering = log.filter((e) => e.level === "stream");
    expect(lingering).toHaveLength(0);
    // Bullet finalized on interrupt
    const bullet = log.find((e) => e.level === "bullet");
    expect(bullet?.done).toBe(true);
  });

  test("run_failed finalizes state and adds error entry", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "run_failed", message: "Something went wrong" }),
    ]);
    const section = log.find((e) => e.level === "section");
    expect(section?.finished).toBe(true);
    const err = log.find((e) => e.level === "error");
    expect(err?.message).toBe("Something went wrong");
  });

  test("MAX_BULLETS: only last 3 bullets per section are visible", () => {
    reset();
    const events: RunEvent[] = [
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
    ];
    // Add 5 tool calls
    for (let i = 1; i <= 5; i++) {
      events.push(evt({ type: "tool_call_started", toolCallId: `tc${i}`, agentId: "executor", name: "read_file", parameters: { path: `/f${i}.ts` } }));
      events.push(evt({ type: "tool_call_completed", toolCallId: `tc${i}`, agentId: "executor", name: "read_file", parameters: { path: `/f${i}.ts` }, output: '{"lines":1}' }));
    }
    events.push(evt({ type: "run_completed", finalOutput: "done" }));
    const log = deriveLog(events);
    const bullets = log.filter((e) => e.level === "bullet");
    expect(bullets).toHaveLength(3);
    // The last 3 bullets (tc3, tc4, tc5) should be present
    expect(bullets.some((b) => b.id === "tc3-bullet")).toBe(true);
    expect(bullets.some((b) => b.id === "tc4-bullet")).toBe(true);
    expect(bullets.some((b) => b.id === "tc5-bullet")).toBe(true);
    // First 2 should be evicted
    expect(bullets.some((b) => b.id === "tc1-bullet")).toBe(false);
    expect(bullets.some((b) => b.id === "tc2-bullet")).toBe(false);
  });

  test("orchestrator text_delta events are suppressed", () => {
    reset();
    const log = deriveLog([
      evt({ type: "text_delta", agentId: "orchestrator", content: '{"task_type":"direct","direct_answer":"hi"}' }),
      evt({ type: "run_completed", finalOutput: '{"task_type":"direct","direct_answer":"hi"}' }),
    ]);
    // orchestrator stream suppressed; run_completed uses finalOutput → extracts direct_answer
    const resp = log.find((e) => e.level === "response");
    expect(resp?.message).toBe("hi");
  });

  test("file-picker text_delta events are suppressed", () => {
    reset();
    const log = deriveLog([
      evt({ type: "text_delta", agentId: "file-picker", content: "some json output" }),
      evt({ type: "run_completed", finalOutput: "real answer" }),
    ]);
    // file-picker stream suppressed; finalOutput used
    const resp = log.find((e) => e.level === "response");
    expect(resp?.message).toBe("real answer");
  });

  test("reasoning_delta events accumulate into a think entry", () => {
    reset();
    const log = deriveLog([
      evt({ type: "reasoning_delta", agentId: "executor", delta: "First part. " }),
      evt({ type: "reasoning_delta", agentId: "executor", delta: "Second part." }),
      evt({ type: "agent_completed", agentId: "executor", output: "" }),
    ]);
    const think = log.find((e) => e.level === "think");
    expect(think).toBeDefined();
    expect(think?.message).toBe("First part. Second part.");
    expect(think?.finished).toBe(true);
  });

  test("empty reasoning buffer → think entry evicted (not shown)", () => {
    reset();
    const log = deriveLog([
      evt({ type: "reasoning_delta", agentId: "executor", delta: "   " }), // whitespace only
      evt({ type: "agent_completed", agentId: "executor", output: "" }),
    ]);
    const think = log.find((e) => e.level === "think");
    expect(think).toBeUndefined();
  });

  test("orchestrator agent_completed suppresses its stream entry", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "orchestrator", task: "route" }),
      evt({ type: "text_delta", agentId: "orchestrator", content: '{"task_type":"direct"}' }),
      evt({ type: "agent_completed", agentId: "orchestrator", output: '{"task_type":"direct"}' }),
      evt({ type: "run_completed", finalOutput: "Direct answer" }),
    ]);
    // orchestrator stream entry should be evicted
    const streamEntries = log.filter((e) => e.level === "stream");
    expect(streamEntries).toHaveLength(0);
    // response should show the final output
    const resp = log.find((e) => e.level === "response");
    expect(resp?.message).toBe("Direct answer");
  });

  test("diff_collected events appear after response on run_completed", () => {
    reset();
    const diff = { file: "/a.ts", added: 1, removed: 0, lines: [] };
    const log = deriveLog([
      evt({ type: "diff_collected", filePath: "/a.ts", diff }),
      evt({ type: "run_completed", finalOutput: "Done editing." }),
    ]);
    const resp = log.find((e) => e.level === "response");
    const diffEntry = log.find((e) => e.level === "diff");
    expect(resp).toBeDefined();
    expect(diffEntry).toBeDefined();
    expect(diffEntry?.message).toBe("/a.ts");
    // diff must come after response
    const respIdx = log.indexOf(resp!);
    const diffIdx = log.indexOf(diffEntry!);
    expect(diffIdx).toBeGreaterThan(respIdx);
  });

  test("section header finalized on agent_completed", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "reader", task: "read" }),
      evt({ type: "agent_completed", agentId: "reader", output: "done" }),
    ]);
    const section = log.find((e) => e.level === "section");
    expect(section?.finished).toBe(true);
  });

  test("stable IDs: bullet ID is toolCallId-bullet", () => {
    reset();
    const log = deriveLog([
      evt({ type: "agent_started", agentId: "executor", task: "t" }),
      evt({ type: "tool_call_started", toolCallId: "my-tool-id", agentId: "executor", name: "read_file", parameters: { path: "/x.ts" } }),
    ]);
    const bullet = log.find((e) => e.level === "bullet");
    expect(bullet?.id).toBe("my-tool-id-bullet");
  });
});

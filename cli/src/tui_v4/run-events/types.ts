import type { DiffEntry } from "../types.ts";

export type RunEvent =
  | {
      type: "run_started";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
    }
  | {
      type: "user_message";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      content: string;
    }
  | {
      type: "agent_started";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      task: string;
    }
  | {
      type: "agent_completed";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      output: string;
    }
  | {
      type: "reasoning_delta";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      delta: string;
    }
  | {
      type: "status_update";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      message: string;
    }
  | {
      type: "next_update";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      message: string;
    }
  | {
      type: "model_call_started";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      turn: number;
      summary: string;
    }
  | {
      type: "model_call_completed";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      turn: number;
      summary: string;
      detail?: string;
    }
  | {
      type: "text_delta";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      content: string;
    }
  | {
      type: "response_delta";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      agentId: string;
      content: string;
    }
  | {
      type: "tool_call_started";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      toolCallId: string;
      agentId: string;
      name: string;
      parameters: Record<string, unknown>;
    }
  | {
      type: "tool_call_completed";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      toolCallId: string;
      agentId: string;
      name: string;
      parameters: Record<string, unknown>;
      output: string;
      error?: string;
    }
  | {
      type: "diff_collected";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      toolCallId: string;
      filePath: string;
      diff: DiffEntry;
    }
  | {
      type: "run_completed";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      finalOutput: string;
    }
  | {
      type: "run_failed";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      message: string;
    }
  | {
      type: "run_interrupted";
      eventId: string;
      seq: number;
      runId: string;
      timestamp: number;
      source: "slash" | "keyboard";
    };

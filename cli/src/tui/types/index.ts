import type { AvailableModelId } from "@santra/shared";

export type TaskStatus = "done" | "active" | "pending" | "error";

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
}

export interface FileEntry {
  name: string;
  path: string;
  status: "modified" | "new" | "read" | "none";
  type: "file" | "dir";
  depth: number;
}

type LogLevel =
  | "user"      // orange user prompt
  | "section"   // bold section header with spinner
  | "bullet"    // indented tool-call result line
  | "info"      // system message
  | "ok"        // success
  | "error"     // error
  | "think"     // reasoning block
  | "diff"      // inline diff view (auto-accepted)
  | "stream"    // live-streaming text (updated in place)
  | "response"; // finalized agent response

export interface DiffLine {
  type: "add" | "remove" | "context";
  lineNo: number;
  content: string;
}
export interface DiffEntry {
  file: string;
  added: number;
  removed: number;
  lines: DiffLine[];
}
export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
  detail?: string;
  diff?: DiffEntry;
  /** bullet: true once the tool call completed */
  done?: boolean;
  /** section: true once the agent phase is done */
  finished?: boolean;
}

export interface AgentStats {
  model: AvailableModelId;
  tokens: number;
  steps: number;
  totalSteps: number;
  elapsed: number; // seconds
  toolCalls: number;
}

export interface ShellState {
  command: string;
  output: { text: string; type: "success" | "fail" | "pending" }[];
}

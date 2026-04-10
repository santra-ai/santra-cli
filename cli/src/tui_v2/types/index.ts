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

type LogLevel = "info" | "tool" | "ok" | "error" | "think" | "diff";

interface DiffLine {
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
}

export interface AgentStats {
  model: AvailableModelId;
  tokens: number;
  steps: number;
  totalSteps: number;
  elapsed: number; // seconds
}

export interface ShellState {
  command: string;
  output: { text: string; type: "success" | "fail" | "pending" }[];
}

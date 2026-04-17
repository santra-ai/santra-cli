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

export type LogLevel =
  | "user"
  | "section"
  | "bullet"
  | "info"
  | "ok"
  | "error"
  | "think"
  | "diff"
  | "stream"
  | "response";

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
  done?: boolean;
  finished?: boolean;
}

export interface AgentStats {
  model: AvailableModelId;
  tokens: number;
  steps: number;
  totalSteps: number;
  elapsed: number;
  toolCalls: number;
}

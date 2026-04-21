export type SegmentTone =
  | "default"
  | "accent"
  | "muted"
  | "success"
  | "warning"
  | "danger"
  | "code"
  | "heading"
  | "file"
  | "command";

export interface TranscriptSegment {
  text: string;
  tone?: SegmentTone;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
}

export type TranscriptIndicator =
  | {
      kind: "spinner";
      color: string;
    }
  | {
      kind: "icon";
      text: string;
      color: string;
      bold?: boolean;
      dim?: boolean;
    };

export interface TranscriptRow {
  key: string;
  before: TranscriptSegment[];
  indicator?: TranscriptIndicator;
  after: TranscriptSegment[];
}

export type TranscriptStatus = "active" | "done";

export interface UserPromptItem {
  id: string;
  kind: "user";
  timestamp: string;
  prompt: string;
}

export interface DividerItem {
  id: string;
  kind: "divider";
  timestamp: string;
  label: string;
}

export interface PhaseItem {
  id: string;
  kind: "phase";
  timestamp: string;
  title: string;
  status: TranscriptStatus;
}

export interface ThinkingItem {
  id: string;
  kind: "thinking";
  timestamp: string;
  label: string;
  content: string;
  status: TranscriptStatus;
}

export interface ToolItem {
  id: string;
  kind: "tool";
  timestamp: string;
  title: string;
  detail?: string;
  status: TranscriptStatus;
}

export interface ResponseItem {
  id: string;
  kind: "response";
  timestamp: string;
  content: string;
  status: TranscriptStatus;
}

export type MockTranscriptItem =
  | DividerItem
  | UserPromptItem
  | PhaseItem
  | ThinkingItem
  | ToolItem
  | ResponseItem;

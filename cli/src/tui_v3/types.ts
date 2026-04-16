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

export interface MockRunStats {
  model: string;
  elapsed: number;
  steps: number;
  totalSteps: number;
  toolCalls: number;
}

export interface ComposerState {
  value: string;
  busy: boolean;
  placeholder: string;
}

export interface MockTerminalState {
  transcript: MockTranscriptItem[];
  stats: MockRunStats;
  composer: ComposerState;
  scrollOffset: number;
  activeRunId: number | null;
}

interface MockRunStepBase {
  id: string;
  delayMs: number;
  timestamp: string;
  statsPatch?: Partial<Pick<MockRunStats, "steps" | "toolCalls">>;
}

export interface PhaseStep extends MockRunStepBase {
  kind: "phase";
  title: string;
  status: TranscriptStatus;
}

export interface ThinkingStep extends MockRunStepBase {
  kind: "thinking";
  label: string;
  content: string;
  status: TranscriptStatus;
}

export interface ToolStep extends MockRunStepBase {
  kind: "tool";
  title: string;
  detail?: string;
  status: TranscriptStatus;
}

export interface ResponseStep extends MockRunStepBase {
  kind: "response";
  content: string;
  status: TranscriptStatus;
  append?: boolean;
}

export type MockRunStep =
  | PhaseStep
  | ThinkingStep
  | ToolStep
  | ResponseStep;

export type SegmentTone =
  | "default"
  | "accent"
  | "muted"
  | "success"
  | "warning"
  | "danger"
  | "code";

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

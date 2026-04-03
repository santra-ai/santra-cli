import type {
  Message,
  CompletionRequest,
  CompletionChunk,
  StreamEvent,
  RunState,
} from "@santra/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessage?: Message[];
  onDelta?: (chunk: string) => void;
};

// todo
// build sse parser

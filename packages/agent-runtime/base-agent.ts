import type {
  Message,
  CompletionRequest,
  CompletionChunk,
  StreamEvent,
  RunState,
} from "packages/shared";

// Agent Specific Types
export type AgentRunOptions = {
  prompt: string;
  previousMessage?: Message[];
  onDelta?: (chunk: string) => void;
};


// todo 
// build sse parser
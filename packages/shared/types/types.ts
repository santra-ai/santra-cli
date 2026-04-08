// Primitives types
export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

// Web Streaming Protocol.
// these are the events santra's backend streams back to agent-runtime over SSE

export type WebStreamEvent =
  | { type: "start" }
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "text"; text: string }
  | { type: "finish" }
  | { type: "error"; message: string; statusCode?: number };

// agent output
export type AgentOutput =
  | { type: "text"; content: string }
  | { type: "error"; message: string; statusCode?: number }
  | { type: "lastMessage"; content: [] };

// RunState Types
export type RunState = {
  messages: Message[];
  output: AgentOutput;
};

// API Contract
export type CompletionRequest = {
  prompt: string;
  messages?: Message[];
};

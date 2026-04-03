// Primitives types
export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

// Streaming types
export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done"; fullContent: string }
  | { type: "error"; message: string; statusCode?: number };

export type AgentOutput =
  | { type: "text"; content: string }
  | { type: "error"; message: string; statusCode?: number };

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

export type CompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  choices: Array<{
    index: number;
    delta: { content?: string; role?: Role };
    finish_reason: string | null;
  }>;
};

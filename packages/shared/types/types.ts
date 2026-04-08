// Primitives types
export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

// Tool System
export type ToolName =
  | "read_file"
  | "write_file"
  | "list_directory"
  | "search_files";

export type ToolCallRequest = {
  id: string;
  name: ToolName;
  parameters: Record<string, unknown>;
};

export type ToolCallResult = {
  id: string;
  name: ToolName;
  output: string;
  error?: string;
};

// Thinking / Reasoning

export type ThinkingStep = {
  agentId: string;
  content: string;
};

// Agents
export type AgentId =
  | "orchestrator"
  | "thinker"
  | "planner"
  | "file-picker"
  | "executor"
  | "reviewer";

export type AgentPhase =
  | { type: "thinking"; agentId: AgentId; delta: string }
  | { type: "tool_call"; call: ToolCallRequest }
  | { type: "tool_result"; result: ToolCallResult }
  | { type: "agent_start"; agentId: AgentId; task: string }
  | { type: "agent_done"; agentId: AgentId; output: string }
  | { type: "delta"; agentId: AgentId; content: string }
  | { type: "done"; finalOutput: string }
  | { type: "error"; message: string };

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
  toolCalls?: ToolCallResult[];
  thinking?: ThinkingStep[];
};

// Swarm State
export type SwarmState = {
  phases: AgentPhase[];
  finalOutput: string;
  toolCallResults: ToolCallResult[];
  thinkingSteps: ThinkingStep[];
};

// API Contract
export type CompletionRequest = {
  prompt: string;
  messages?: Message[];
};

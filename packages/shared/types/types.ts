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
  | "str_replace"
  | "apply_patch"
  | "list_directory"
  | "search_files"
  | "search_text"
  | "get_cwd"
  | "spawn_agent"
  | "spawn_agents"
  | "glob"
  | "code_search"
  | "read_subtree"
  | "write_todos"
  | "run_terminal_command"
  | "set_output"
  | "set_messages"
  | "task_completed"
  | "suggest_followups"
  | "lookup_agent_info"
  | "ask_user"
  | "web_search"
  | "read_docs";

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
export type AgentId = string;

export type AgentPhase =
  | { type: "thinking"; agentId: AgentId; delta: string }
  | { type: "status"; agentId: AgentId; message: string }
  | { type: "next"; agentId: AgentId; message: string }
  | { type: "model_call_start"; agentId: AgentId; turn: number; summary: string }
  | { type: "model_call_end"; agentId: AgentId; turn: number; summary: string; detail?: string }
  | { type: "tool_call"; agentId: AgentId; call: ToolCallRequest }
  | { type: "tool_result"; agentId: AgentId; result: ToolCallResult }
  | { type: "agent_start"; agentId: AgentId; task: string }
  | { type: "agent_done"; agentId: AgentId; output: string }
  | { type: "delta"; agentId: AgentId; content: string } // streaming text from a swarm agent
  | { type: "done"; finalOutput: string }
  | { type: "error"; message: string };

// Web Streaming Protocol.
export type WebStreamEvent =
  | { type: "start" }
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "text"; text: string }
  | { type: "finish" }
  | { type: "error"; message: string; statusCode?: number };

// Agent output
export type AgentOutput =
  | { type: "text"; content: string }
  | { type: "error"; message: string; statusCode?: number }
  | { type: "lastMessage"; content: [] }
  | { type: "structured"; content: unknown };

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
  error?: string;
};

// API Contract
export type CompletionRequest = {
  prompt: string;
  messages?: Message[];
};

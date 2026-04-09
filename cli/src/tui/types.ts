import type { AgentId, ToolCallRequest, ToolCallResult } from "@santra/shared";

export type MessageRole = "user" | "agent" | "error";

export interface ChatMessage {
  role: MessageRole;
  text: string;
}

export type ActivityEvent =
  | { type: "agent_start"; agentId: AgentId; task: string }
  | { type: "agent_done"; agentId: AgentId }
  | { type: "tool_call"; call: ToolCallRequest }
  | { type: "tool_result"; result: ToolCallResult }
  | { type: "thinking"; agentId: AgentId; snippet: string };

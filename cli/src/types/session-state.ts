import type { Message } from "@santra/shared";

export type AgentState = {
  messageHistory: Message[];
};

export type SessionState = {
  mainAgentState: AgentState;
};

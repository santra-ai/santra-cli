export type MessageRole = "user" | "agent" | "error";

export interface ChatMessage {
  role: MessageRole;
  text: String;
}

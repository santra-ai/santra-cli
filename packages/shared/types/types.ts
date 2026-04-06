// Primitives types
import type { AvailableModelId } from "./model-ids";

export interface ChatCompletionRequestBody {
  model: AvailableModelId;
  messages: {
    role: "system" | "user" | "assistant" | "tool" | "developer" | string;
    content: string | null;
  }[];
  stream?: boolean;
}

export type Message = ChatCompletionRequestBody["messages"][number];

export interface ChatCompletionResponseBody {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
}

export interface ChatCompletionChunk {
  choices: {
    delta: {
      content: string | null;
    };
  }[];
}

// RunState Types
export type RunState = {
  messages: ChatCompletionRequestBody["messages"];
  output: { type: "text"; content: string } | { type: "error"; message: string; statusCode?: number };
};

// API Contract
export type CompletionRequest = {
  prompt: string;
  messages?: ChatCompletionRequestBody["messages"];
};

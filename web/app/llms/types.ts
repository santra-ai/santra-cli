import type { AvailableModelId } from "@santra/shared";

export type ChatCompletionMessage = {
  role: string;
  content: string;
};

export type ChatCompletionRequestBody = {
  model: AvailableModelId;
  messages: ChatCompletionMessage[];
  stream: boolean;
};

export type ChatCompletionChunk = {
  id: string;
  choices: Array<{
    delta: { content?: string; role?: string };
    finish_reason: string | null;
  }>;
};

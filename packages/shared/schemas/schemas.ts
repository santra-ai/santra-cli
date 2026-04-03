import { z } from "zod";

export const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const CompletionRequestSchema = z.object({
  prompt: z.string().min(2, "prompt must not be empty"),
  messages: z.array(MessageSchema).optional(),
});

export const AgentOutputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    statusCode: z.number().optional(),
  }),
]);

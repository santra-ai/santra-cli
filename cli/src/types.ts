import { z } from "zod";

export type RunState = {
  //   sessionState?: undefined -> future part
  output: AgentOutput;
};

export type ExecuteParams = {
  prompt: string
  previousRun?: RunState
}
  

export const AgentOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('structuredOutput'),
    value: z.record(z.string(), z.any()).or(z.null()),
  }),
  z.object({
    type: z.literal('lastMessage'),
    value: z.array(z.any()), // Array of assistant and tool messages from the last turn, including tool results
  }),
  z.object({
    type: z.literal('allMessages'),
    value: z.array(z.any()),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    statusCode: z.number().optional(),
    error: z.string().optional(),
  }),
])
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
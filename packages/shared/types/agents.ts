import type { Message, ToolCallRequest, ToolCallResult, ToolName } from "./types.ts";

export type AgentOutputMode =
  | "last_message"
  | "all_messages"
  | "structured_output";

export type AgentSchemaProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  required?: boolean;
  properties?: Record<string, AgentSchemaProperty>;
  items?: AgentSchemaProperty;
};

export type AgentJsonSchema = Record<string, AgentSchemaProperty>;

export type ProgrammaticToolCall = {
  toolName: ToolName;
  input: Record<string, unknown>;
};

export type StepText = {
  type: "STEP_TEXT";
  text: string;
};

export type GenerateN = {
  type: "GENERATE_N";
  count: number;
};

export type AgentStateView = {
  messages: Message[];
  toolCalls: ToolCallResult[];
  output?: unknown;
};

export type AgentStepContext = {
  agentState: AgentStateView;
  prompt?: string;
  params?: Record<string, unknown>;
  logger: {
    debug: (data: unknown, message?: string) => void;
    info: (data: unknown, message?: string) => void;
    warn: (data: unknown, message?: string) => void;
    error: (data: unknown, message?: string) => void;
  };
};

export type StepExecutionResult = {
  agentState: AgentStateView;
  toolResult?: ToolCallResult | ToolCallResult[];
  stepsComplete: boolean;
  nResponses?: string[];
};

export type StepGeneratorYield =
  | ProgrammaticToolCall
  | "STEP"
  | "STEP_ALL"
  | StepText
  | GenerateN;

export type StepGeneratorLike =
  | Generator<StepGeneratorYield, void, StepExecutionResult>
  | AsyncGenerator<StepGeneratorYield, void, StepExecutionResult>;

export type AgentHandleSteps =
  | ((context: AgentStepContext) => StepGeneratorLike)
  | string;

export type AgentTemplate = {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  toolNames?: ToolName[];
  spawnableAgents?: string[];
  inputSchema?: {
    prompt?: { type: "string"; description?: string };
    params?: AgentJsonSchema;
  };
  outputMode?: AgentOutputMode;
  outputSchema?: AgentJsonSchema;
  spawnerPrompt?: string;
  includeMessageHistory?: boolean;
  inheritParentSystemPrompt?: boolean;
  systemPrompt?: string;
  instructionsPrompt?: string;
  stepPrompt?: string;
  handleSteps?: AgentHandleSteps;
  endpoint?: string;
  _sourceFilePath?: string;
};

export type LoadedAgentTemplates = Record<string, AgentTemplate>;

export function isProgrammaticToolCall(
  value: unknown,
): value is ProgrammaticToolCall {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { toolName?: unknown }).toolName === "string" &&
    !!(value as { input?: unknown }).input &&
    typeof (value as { input?: unknown }).input === "object"
  );
}

export function isStepText(value: unknown): value is StepText {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "STEP_TEXT" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

export function isGenerateN(value: unknown): value is GenerateN {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "GENERATE_N" &&
    typeof (value as { count?: unknown }).count === "number"
  );
}

export function isStepGeneratorYield(
  value: unknown,
): value is StepGeneratorYield {
  return (
    value === "STEP" ||
    value === "STEP_ALL" ||
    isProgrammaticToolCall(value) ||
    isStepText(value) ||
    isGenerateN(value)
  );
}

export function normalizeStructuredOutput(
  outputMode: AgentOutputMode | undefined,
  messages: Message[],
  fallbackText: string,
  structuredOutput?: unknown,
): unknown {
  if (outputMode === "all_messages") {
    return messages;
  }

  if (outputMode === "structured_output") {
    return structuredOutput ?? { text: fallbackText };
  }

  return fallbackText;
}

export function buildToolCallRequest(
  id: string,
  call: ProgrammaticToolCall,
): ToolCallRequest {
  return {
    id,
    name: call.toolName,
    parameters: call.input,
  };
}

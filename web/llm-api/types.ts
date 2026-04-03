import type { AvailableModelId } from "./model-ids";

export type JSONSchemaTypeName = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";

export type JSONSchemaValue = string | number | boolean | null | JSONSchemaValue[] | { [key: string]: JSONSchemaValue };

/**
 * Boolean schemas are valid in newer drafts, so callers may pass a schema object
 * or a literal `true`/`false` definition.
 */
export type JSONSchemaDefinition = JSONSchema | boolean;

/**
 * Supports the JSON Schema shape used by tool/function parameter definitions across
 * Draft 4, 6, and 7, plus a few OpenAPI compatibility fields.
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  id?: string;
  $ref?: string;
  $comment?: string;
  title?: string;
  description?: string;

  type?: JSONSchemaTypeName | JSONSchemaTypeName[];

  enum?: JSONSchemaValue[];
  const?: JSONSchemaValue;

  multipleOf?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;

  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  items?: JSONSchemaDefinition | JSONSchemaDefinition[];
  additionalItems?: JSONSchemaDefinition;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchemaDefinition;

  properties?: Record<string, JSONSchemaDefinition>;
  patternProperties?: Record<string, JSONSchemaDefinition>;
  additionalProperties?: JSONSchemaDefinition;
  unevaluatedProperties?: JSONSchemaDefinition;
  required?: string[];
  propertyNames?: JSONSchemaDefinition;
  minProperties?: number;
  maxProperties?: number;
  dependencies?: Record<string, JSONSchemaDefinition | string[]>;

  allOf?: JSONSchemaDefinition[];
  anyOf?: JSONSchemaDefinition[];
  oneOf?: JSONSchemaDefinition[];
  not?: JSONSchemaDefinition;

  if?: JSONSchemaDefinition;
  then?: JSONSchemaDefinition;
  else?: JSONSchemaDefinition;

  definitions?: Record<string, JSONSchemaDefinition>;
  $defs?: Record<string, JSONSchemaDefinition>;

  default?: JSONSchemaValue;
  examples?: JSONSchemaValue[];
  readOnly?: boolean;
  writeOnly?: boolean;

  // Kept for OpenAPI 3.0 compatibility even though it is not part of standard JSON Schema.
  nullable?: boolean;
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  deprecated?: boolean;

  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolFunction {
  name: string;
  description?: string;
  parameters?: JSONSchema | Record<string, never>;
  strict?: boolean;
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface ToolChoiceFunction {
  type: "function";
  function: {
    name: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer" | string;
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ResponseFormat {
  type: "text" | "json_object" | "json_schema";
  json_schema?: {
    name: string;
    schema: JSONSchema;
    strict?: boolean;
  };
}

export interface StreamOptions {
  include_usage?: boolean;
}

// Chat Completions API
export interface ChatCompletionsRequest {
  model: AvailableModelId;
  messages: ChatMessage[];

  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  n?: number;
  seed?: number;

  max_tokens?: number;
  stop?: string | string[];
  response_format?: ResponseFormat;

  frequency_penalty?: number;
  presence_penalty?: number;
  logit_bias?: Record<string, number>;

  stream?: boolean;
  stream_options?: StreamOptions;

  tools?: Tool[];
  tool_choice?: "none" | "auto" | "required" | ToolChoiceFunction;
  parallel_tool_calls?: boolean;

  user?: string;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  stop_reason?: string | null;
  logprobs?: {
    content: Array<{
      token: string;
      logprob: number;
      top_logprobs: Array<{ token: string; logprob: number }>;
    }> | null;
  } | null;
}

export interface ChatDelta {
  role: "assistant" | string | null;
  content: string | null;
  tool_calls?: StreamToolCallDelta[];
}

export interface ChatStreamChoice {
  index: number;
  delta: ChatDelta;
  logprobs: null;
  finish_reason: ChatChoice["finish_reason"];
  stop_reason?: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
}

export interface ChatCompletionsResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: Usage;
  system_fingerprint?: string | null;
  service_tier?: string;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatStreamChoice[];
  usage?: Usage | null;
  system_fingerprint?: string | null;
  service_tier?: string;
}

export type ChatCompletionsStreamData = ChatCompletionChunk | "[DONE]";

// Models API
export interface Model {
  id: string;
  object: "model" | string;
  created: number;
  owned_by: string;
}

export interface ListModelsResponse {
  object: "list" | string;
  data: Model[];
}

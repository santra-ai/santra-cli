import type {
  AgentTemplate,
  Message,
  StepExecutionResult,
  StepGeneratorLike,
  StepGeneratorYield,
  ToolCallRequest,
  ToolCallResult,
} from "@santra/shared";
import {
  buildToolCallRequest,
  isGenerateN,
  isProgrammaticToolCall,
  isStepText,
  isStepGeneratorYield,
  normalizeStructuredOutput,
} from "@santra/shared";
import type { AgentPhase, AgentId } from "@santra/shared";
import type { BaseAgent, FileChangeFeedback, UserQuestion } from "./base-agent.ts";
import { executeToolCall } from "./tools/local-runner.ts";

type ToolExecutionContext = {
  messages: Message[];
  agentId: AgentId;
  prompt: string;
};

export type ProgrammaticRunOptions = {
  agent: BaseAgent;
  agentId: AgentId;
  template: AgentTemplate;
  prompt: string;
  params?: Record<string, unknown>;
  messages: Message[];
  systemPrompt?: string;
  maxToolIterations?: number;
  abortSignal?: AbortSignal;
  onFileChangeReview?: (
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
  onUserQuestion?: (questions: UserQuestion[]) => Promise<string>;
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  toolExecutor?: (
    call: ToolCallRequest,
    context: ToolExecutionContext,
  ) => Promise<ToolCallResult>;
};

export type ProgrammaticRunResult = {
  output: string;
  messages: Message[];
  toolCalls: ToolCallResult[];
  structuredOutput?: unknown;
  completedViaTool?: boolean;
};

type GeneratorNextState = StepExecutionResult;

function createLogger(agentId: string) {
  return {
    debug: (data: unknown, message?: string) => {
      console.debug(`[${agentId}]`, message ?? "", data);
    },
    info: (data: unknown, message?: string) => {
      console.info(`[${agentId}]`, message ?? "", data);
    },
    warn: (data: unknown, message?: string) => {
      console.warn(`[${agentId}]`, message ?? "", data);
    },
    error: (data: unknown, message?: string) => {
      console.error(`[${agentId}]`, message ?? "", data);
    },
  };
}

async function nextGeneratorValue(
  generator: StepGeneratorLike,
  input: GeneratorNextState,
): Promise<IteratorResult<StepGeneratorYield, void>> {
  if (typeof (generator as AsyncGenerator<StepGeneratorYield>).next === "function") {
    return (generator as
      | AsyncGenerator<StepGeneratorYield, void, GeneratorNextState>
      | Generator<StepGeneratorYield, void, GeneratorNextState>).next(input);
  }

  throw new Error("Invalid handleSteps generator.");
}

function appendAssistantText(messages: Message[], text: string): Message[] {
  if (!text.trim()) return messages;
  return [...messages, { role: "assistant", content: text }];
}

function buildToolCallXml(call: ToolCallRequest): string {
  return `<tool_call name="${call.name}">\n${JSON.stringify(call.parameters)}\n</tool_call>`;
}

function buildToolResultXml(result: ToolCallResult): string {
  return `<tool_result name="${result.name}" id="${result.id}">\n${result.output}\n</tool_result>`;
}

export async function runProgrammaticAgent(
  options: ProgrammaticRunOptions,
): Promise<ProgrammaticRunResult> {
  const {
    agent,
    agentId,
    template,
    prompt,
    params,
    systemPrompt,
    maxToolIterations = 20,
    abortSignal,
    onFileChangeReview,
    onUserQuestion,
    onDelta,
    onPhase,
    toolExecutor,
  } = options;
  let messages = [...options.messages];
  let toolResults: ToolCallResult[] = [];
  let structuredOutput: unknown;
  let completedViaTool = false;
  let stepCounter = 0;

  const generatorFn =
    typeof template.handleSteps === "string"
      ? (0, eval)(`(${template.handleSteps})`)
      : template.handleSteps;

  if (typeof generatorFn !== "function") {
    throw new Error(`Agent '${template.id}' has no executable handleSteps.`);
  }

  const generator = generatorFn({
    agentState: {
      messages,
      toolCalls: toolResults,
    },
    prompt,
    params,
    logger: createLogger(agentId),
  }) as StepGeneratorLike;

  let state: GeneratorNextState = {
    agentState: {
      messages,
      toolCalls: toolResults,
    },
    stepsComplete: false,
  };

  while (stepCounter < maxToolIterations) {
    stepCounter += 1;
    const result = await nextGeneratorValue(generator, state);
    if (result.done) break;

    const yielded = result.value;
    if (!isStepGeneratorYield(yielded)) {
      throw new Error(
        `Invalid handleSteps yield value in agent '${template.id}': ${JSON.stringify(yielded)}`,
      );
    }

    if (yielded === "STEP" || yielded === "STEP_ALL") {
      const run = await agent.run({
        prompt: "",
        agentId,
        systemPrompt,
        previousMessages: messages,
        maxToolIterations: yielded === "STEP" ? 1 : maxToolIterations,
        abortSignal,
        onFileChangeReview,
        onUserQuestion,
        onDelta,
        onPhase,
        appendPrompt: false,
        toolExecutor,
      });

      messages = run.messages;
      toolResults = run.toolCalls ?? toolResults;
      const outputText =
        run.output.type === "text" ? run.output.content : "";
      state = {
        agentState: {
          messages,
          toolCalls: toolResults,
          output: outputText,
        },
        stepsComplete: true,
        toolResult: run.toolCalls?.at(-1),
        nResponses: outputText ? [outputText] : [],
      };
      continue;
    }

    if (isStepText(yielded)) {
      messages = appendAssistantText(messages, yielded.text);
      state = {
        agentState: {
          messages,
          toolCalls: toolResults,
          output: yielded.text,
        },
        stepsComplete: true,
        nResponses: [yielded.text],
      };
      continue;
    }

    if (isGenerateN(yielded)) {
      const responses: string[] = [];
      for (let index = 0; index < yielded.count; index += 1) {
        const run = await agent.run({
          prompt: "",
          agentId,
          systemPrompt,
          previousMessages: messages,
          maxToolIterations: 1,
          abortSignal,
          onFileChangeReview,
          onUserQuestion,
          onDelta,
          onPhase,
          appendPrompt: false,
          toolExecutor,
        });
        messages = run.messages;
        toolResults = run.toolCalls ?? toolResults;
        if (run.output.type === "text" && run.output.content.trim()) {
          responses.push(run.output.content);
        }
      }
      state = {
        agentState: {
          messages,
          toolCalls: toolResults,
          output: responses.at(-1),
        },
        stepsComplete: true,
        nResponses: responses,
      };
      continue;
    }

    if (!isProgrammaticToolCall(yielded)) {
      throw new Error(
        `Expected a programmatic tool call from '${template.id}', received ${JSON.stringify(yielded)}`,
      );
    }

    const call = buildToolCallRequest(`pg_${agentId}_${stepCounter}`, yielded);
    const allowedToolNames = template.toolNames ?? [];
    if (allowedToolNames.length > 0 && !allowedToolNames.includes(call.name)) {
      throw new Error(
        `Agent '${template.id}' is not allowed to call tool '${call.name}'.`,
      );
    }

    const execContext = { messages, agentId, prompt };
    let toolResult: ToolCallResult;
    onPhase?.({ type: "tool_call", agentId, call });

    if (call.name === "set_output") {
      const raw = call.parameters["data"];
      if (typeof raw === "string") {
        try {
          structuredOutput = JSON.parse(raw);
        } catch {
          structuredOutput = raw;
        }
      } else {
        structuredOutput = raw;
      }
      toolResult = {
        id: call.id,
        name: call.name,
        output: JSON.stringify({ ok: true, data: structuredOutput }),
      };
    } else if (call.name === "set_messages") {
      const rawMessages = call.parameters["messages"];
      const mode =
        call.parameters["mode"] === "append" ? "append" : "replace";
      const parsed =
        typeof rawMessages === "string"
          ? (JSON.parse(rawMessages) as Message[])
          : (rawMessages as Message[]);
      messages = mode === "append" ? [...messages, ...parsed] : [...parsed];
      toolResult = {
        id: call.id,
        name: call.name,
        output: JSON.stringify({ ok: true, mode, count: parsed.length }),
      };
    } else if (call.name === "task_completed") {
      completedViaTool = true;
      toolResult = {
        id: call.id,
        name: call.name,
        output: JSON.stringify({
          ok: true,
          summary: String(call.parameters["summary"] ?? ""),
        }),
      };
    } else {
      toolResult = toolExecutor
        ? await toolExecutor(call, execContext)
        : await executeToolCall(call);
    }

    toolResults = [...toolResults, toolResult];
    onPhase?.({ type: "tool_result", agentId, result: toolResult });
    messages = [
      ...messages,
      { role: "assistant", content: buildToolCallXml(call) },
      { role: "user", content: buildToolResultXml(toolResult) },
    ];
    state = {
      agentState: {
        messages,
        toolCalls: toolResults,
        output: structuredOutput,
      },
      toolResult,
      stepsComplete: completedViaTool || !toolResult.error,
    };

    if (completedViaTool) break;
  }

  const lastAssistantMessage =
    [...messages].reverse().find((message) => message.role === "assistant")
      ?.content ?? "";
  const normalizedOutput = normalizeStructuredOutput(
    template.outputMode,
    messages,
    lastAssistantMessage,
    structuredOutput,
  );

  return {
    output:
      typeof normalizedOutput === "string"
        ? normalizedOutput
        : JSON.stringify(normalizedOutput),
    messages,
    toolCalls: toolResults,
    structuredOutput: normalizedOutput,
    completedViaTool,
  };
}

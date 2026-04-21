import type {
  Message,
  CompletionRequest,
  WebStreamEvent,
  RunState,
  AgentPhase,
  ToolCallRequest,
  ToolCallResult,
  ThinkingStep,
  AgentId,
  ToolName,
} from "@santra/shared";
import { getToolDefinition } from "@santra/shared";
import { StreamParser, sanitizeJsonLiterals } from "./tools/parser.ts";
import { executeToolCall } from "./tools/local-runner.ts";

export type FileChangeFeedback =
  | { decision: "keep" }
  | { decision: "revert" }
  | { decision: "feedback"; message: string };

export type UserQuestionOption = {
  label: string;
  description?: string;
};

export type UserQuestion = {
  question: string;
  header?: string;
  options?: UserQuestionOption[];
};

export type AgentRunOptions = {
  prompt: string;
  agentId?: AgentId;
  systemPrompt?: string;
  suppressProgressPhases?: boolean;
  previousMessages?: Message[];
  appendPrompt?: boolean;
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  maxToolIterations?: number;
  abortSignal?: AbortSignal;
  onFileChangeReview?: (
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
  onUserQuestion?: (questions: UserQuestion[]) => Promise<string>;
  toolExecutor?: (
    call: ToolCallRequest,
    context: { messages: Message[]; agentId: AgentId; prompt: string },
  ) => Promise<ToolCallResult>;
};

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function parseSSELine(raw: string): WebStreamEvent | null {
  const line = raw.trim();
  if (!line.startsWith("data:")) return null;
  const payload = line.slice("data:".length).trim();
  if (!payload) return null;
  try {
    return JSON.parse(payload) as WebStreamEvent;
  } catch {
    return null;
  }
}

async function* readSSE(reader: {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}): AsyncGenerator<WebStreamEvent> {
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = parseSSELine(line);
      if (!ev) continue;
      yield ev;
      if (ev.type === "finish" || ev.type === "error") return;
    }
  }
}

function truncateSummary(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function describeModelTurnStart(_agentId: string, _turn: number, lastUserContent: string): string {
  if (lastUserContent.includes("<tool_result")) {
    return "Reviewing tool result";
  }

  return "Thinking";
}

function summarizeModelTurnResult(
  toolCalls: ToolCallRequest[],
  visibleText: string,
): { summary: string; detail?: string } {
  if (toolCalls.length > 0) {
    const toolNames = toolCalls.map((call) => call.name);
    const compact = toolNames.slice(0, 3).join(", ");
    const extra = toolNames.length > 3 ? ` +${toolNames.length - 3} more` : "";
    return {
      summary: `I decided to use ${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"} next.`,
      detail: `Next tools: ${compact}${extra}`,
    };
  }

  const summary = truncateSummary(visibleText, 90);
  return summary
    ? {
        summary: "I have enough context to explain what I found.",
        detail: summary,
      }
    : {
        summary: "I finished this step without any visible text.",
      };
}

function normalizeToolOutputValue(value: unknown): string {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeToolOutputValue(parsed);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "summary", "message", "output", "data"]) {
      if (key in record) {
        return normalizeToolOutputValue(record[key]);
      }
    }
    return JSON.stringify(record);
  }

  if (value === undefined || value === null) return "";
  return String(value);
}

function parseMessageArray(value: unknown): Message[] | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Message[];
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value as Message[];
  }
  return null;
}

function parseAskUserQuestions(parameters: Record<string, unknown>): UserQuestion[] {
  const rawQuestions = parameters["questions"];
  const singleQuestion = typeof parameters["question"] === "string"
    ? parameters["question"].trim()
    : "";

  let questions: UserQuestion[] = [];

  if (typeof rawQuestions === "string") {
    try {
      questions = JSON.parse(rawQuestions) as UserQuestion[];
    } catch {
      questions = [];
    }
  } else if (Array.isArray(rawQuestions)) {
    questions = rawQuestions as UserQuestion[];
  }

  if (!questions.length && singleQuestion) {
    questions = [{ question: singleQuestion }];
  }

  return questions.filter(
    (question): question is UserQuestion =>
      !!question &&
      typeof question === "object" &&
      typeof question.question === "string" &&
      question.question.trim().length > 0,
  );
}

function isBroadRepoExplanationPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("whole codebase") ||
    lower.includes("entire codebase") ||
    lower.includes("read the whole") ||
    lower.includes("explain me everything") ||
    lower.includes("explain everything") ||
    lower.includes("full project structure") ||
    lower.includes("entire repository") ||
    lower.includes("whole repo")
  );
}

function isPrematureRepoExplanation(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("sure, i can help") ||
    lower.includes("i can help you") ||
    lower.includes("guide you through") ||
    lower.includes("let's start by") ||
    lower.includes("first, let's") ||
    lower.includes("i don't have direct access") ||
    lower.includes("i don't have access") ||
    lower.includes("thanks for providing") ||
    lower.includes("to understand the codebase")
  );
}

function stripNonResponseMarkup(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, "")
    .replace(/<next\b[^>]*>[\s\S]*?<\/next>/gi, "")
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_result\b[^>]*>[\s\S]*?<\/tool_result>/gi, "")
    .replace(/<\/?(?:tool_call|tool_result|think|status|next)\b[^>]*>/gi, "")
    .trim();
}

function extractJsonObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return out;
}

function recoverToolCallFromText(
  text: string,
  agentId: AgentId,
  recoveredId: string,
): ToolCallRequest | null {
  if (!["orchestrator", "file-picker", "reader", "executor"].includes(agentId)) {
    return null;
  }

  const nameHints: ToolName[] = [
    "write_file",
    "str_replace",
    "read_file",
    "search_files",
    "search_text",
    "list_directory",
    "get_cwd",
  ];

  for (const raw of extractJsonObjects(text)) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      try {
        parsed = JSON.parse(sanitizeJsonLiterals(raw)) as Record<string, unknown>;
      } catch {
        // unparseable — skip
      }
    }
    if (!parsed) continue;

    let inferredName: ToolName | null = null;
    if (
      typeof parsed["path"] === "string" &&
      typeof parsed["old_string"] === "string" &&
      typeof parsed["new_string"] === "string"
    ) {
      inferredName = "str_replace";
    } else if (
      typeof parsed["path"] === "string" &&
      typeof parsed["content"] === "string"
    ) {
      inferredName = "write_file";
    } else if (typeof parsed["pattern"] === "string") {
      inferredName = "search_files";
    } else if (typeof parsed["query"] === "string") {
      inferredName = "search_text";
    } else if (typeof parsed["path"] === "string") {
      inferredName = text.includes("list_directory")
        ? "list_directory"
        : "read_file";
    } else if (Object.keys(parsed).length === 0 && text.includes("get_cwd")) {
      inferredName = "get_cwd";
    }

    const explicitHint = nameHints.find((name) => text.includes(name));
    const name = explicitHint ?? inferredName;
    if (!name) continue;

    return {
      id: recoveredId,
      name,
      parameters: parsed,
    };
  }

  return null;
}

function firstString(
  params: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function normalizeToolCall(call: ToolCallRequest): ToolCallRequest {
  const parameters = { ...call.parameters };

  const pathAlias = firstString(parameters, [
    "path",
    "file",
    "file_path",
    "filepath",
    "pathname",
    "target",
    "dir",
    "directory",
    "source",
  ]);
  if (pathAlias && typeof parameters["path"] !== "string") {
    parameters["path"] = pathAlias;
  }

  const patternAlias = firstString(parameters, [
    "pattern",
    "glob",
    "file_pattern",
    "path_glob",
  ]);
  if (patternAlias && typeof parameters["pattern"] !== "string") {
    parameters["pattern"] = patternAlias;
  }

  const queryAlias = firstString(parameters, [
    "query",
    "search",
    "term",
    "text",
    "needle",
  ]);
  if (queryAlias && typeof parameters["query"] !== "string") {
    parameters["query"] = queryAlias;
  }

  const commandAlias = firstString(parameters, ["command", "cmd"]);
  if (commandAlias && typeof parameters["command"] !== "string") {
    parameters["command"] = commandAlias;
  }

  const contentAlias = firstString(parameters, ["content", "text", "body"]);
  if (contentAlias && typeof parameters["content"] !== "string") {
    parameters["content"] = contentAlias;
  }

  const oldStringAlias = firstString(parameters, [
    "old_string",
    "old",
    "old_text",
    "oldText",
  ]);
  if (oldStringAlias && typeof parameters["old_string"] !== "string") {
    parameters["old_string"] = oldStringAlias;
  }

  const newStringAlias = firstString(parameters, [
    "new_string",
    "new",
    "replacement",
    "new_text",
    "newText",
  ]);
  if (newStringAlias && typeof parameters["new_string"] !== "string") {
    parameters["new_string"] = newStringAlias;
  }

  const sourceAlias = firstString(parameters, ["source", "url"]);
  if (sourceAlias && typeof parameters["source"] !== "string") {
    parameters["source"] = sourceAlias;
  }

  return {
    ...call,
    parameters,
  };
}

function getMissingRequiredParams(call: ToolCallRequest): string[] {
  const definition = getToolDefinition(call.name);
  if (!definition) return [];

  return Object.entries(definition.parameters)
    .filter(([, schema]) => schema.required)
    .map(([name]) => name)
    .filter((name) => {
      const value = call.parameters[name];
      return (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim().length === 0)
      );
    });
}

// ─── BaseAgent ────────────────────────────────────────────────────────────────

const MAX_429_RETRIES = 3;

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export class BaseAgent {
  private activeEndpoint?: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(
    private readonly endpoint: string,
    extraHeaders?: Record<string, string>,
  ) {
    this.extraHeaders = extraHeaders ?? {};
  }

  private getCandidateEndpoints(): string[] {
    const base = this.activeEndpoint ?? this.endpoint;
    const candidates = [base];

    if (process.env["WEB_ENDPOINT"]) {
      return candidates;
    }

    try {
      const url = new URL(base);
      if (
        (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        url.port === "3000"
      ) {
        for (const port of ["3001", "3002", "3003", "3004", "3005"]) {
          const next = new URL(base);
          next.port = port;
          candidates.push(next.toString());
        }
      }
    } catch {
      return candidates;
    }

    return Array.from(new Set(candidates));
  }

  private async singleTurn(
    messages: Message[],
    onDelta?: (c: string) => void,
    onReasoning?: (c: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<{ text: string; error?: string; retryAfterMs?: number }> {
    const body: CompletionRequest = {
      prompt: messages.at(-1)?.content ?? "",
      messages,
    };
    let resp: Response | undefined;
    let lastError: string | undefined;

    const candidateEndpoints = this.getCandidateEndpoints();

    const lastCandidate = candidateEndpoints[candidateEndpoints.length - 1];

    for (const endpoint of candidateEndpoints) {
      try {
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), 120_000); // 2 min timeout
        // Combine user abort signal with timeout signal
        let combinedSignal: AbortSignal;
        if (abortSignal) {
          // If AbortSignal.any is available (Bun 1.0.25+), use it; otherwise forward manually
          if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
            combinedSignal = (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([abortSignal, timeoutController.signal]);
          } else {
            abortSignal.addEventListener("abort", () => timeoutController.abort(), { once: true });
            combinedSignal = timeoutController.signal;
          }
        } else {
          combinedSignal = timeoutController.signal;
        }
        resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...this.extraHeaders,
          },
          body: JSON.stringify(body),
          signal: combinedSignal,
        }).finally(() => clearTimeout(timeout));
        if (
          !resp.ok &&
          (resp.status === 404 || resp.status === 405) &&
          endpoint !== lastCandidate
        ) {
          lastError = `HTTP ${resp.status}: ${resp.statusText}`;
          resp = undefined;
          continue;
        }
        this.activeEndpoint = endpoint;
        break;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return { text: "", error: "Aborted" };
        }
        lastError = err instanceof Error ? err.message : "Network error";
        continue;
      }
    }

    if (!resp)
      return {
        text: "",
        error: lastError ?? "Network error",
      };
    if (!resp.ok) {
      const retryAfterHeader = resp.headers.get("Retry-After");
      const retryAfterMs =
        retryAfterHeader != null && /^\d+$/.test(retryAfterHeader.trim())
          ? Number(retryAfterHeader) * 1_000
          : undefined;
      return { text: "", error: `HTTP ${resp.status}: ${resp.statusText}`, retryAfterMs };
    }
    if (!resp.body) return { text: "", error: "Empty response body" };

    const reader = resp.body.getReader();
    let finalText = "";
    let deltaText = "";
    try {
      for await (const ev of readSSE(reader)) {
        if (ev.type === "delta") {
          deltaText += ev.content;
          onDelta?.(ev.content);
        }
        if (ev.type === "reasoning") {
          onReasoning?.(ev.content);
        }
        if (ev.type === "text") finalText = ev.text;
        if (ev.type === "error")
          return { text: finalText || deltaText, error: ev.message };
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        await reader.cancel().catch(() => {});
        return { text: finalText || deltaText, error: "Aborted" };
      }
      throw err;
    }
    // Prefer the aggregated text event; fall back to accumulated deltas
    return { text: finalText || deltaText };
  }

  async run(options: AgentRunOptions): Promise<RunState> {
    const {
      prompt,
      agentId = "executor",
      systemPrompt,
      suppressProgressPhases = false,
      previousMessages = [],
      appendPrompt = true,
      onDelta,
      onPhase,
      maxToolIterations = 8,
      abortSignal,
      onFileChangeReview,
      onUserQuestion,
      toolExecutor,
    } = options;

    let messages: Message[];

    if (systemPrompt) {
      messages = [
        { role: "system" as const, content: systemPrompt },
        ...(appendPrompt ? [{ role: "user" as const, content: prompt }] : []),
      ];
    } else if (previousMessages.length > 0) {
      messages = appendPrompt
        ? [
            ...previousMessages,
            { role: "user" as const, content: prompt },
          ]
        : [...previousMessages];
    } else {
      messages = appendPrompt
        ? [{ role: "user" as const, content: prompt }]
        : [];
    }

    const allToolResults: ToolCallResult[] = [];
    const allThinking: ThinkingStep[] = [];
    let finalText = "";
    let toolCallCounter = 0;
    let repoReadNudges = 0;
    let forcedFinalOutput: string | undefined;
    let taskCompleted = false;
    let consecutiveFailedToolOnlyTurns = 0;

    // Cache original file content for write_file reverts: callId → originalContent
    const originalFileContent = new Map<string, string>();

    for (let i = 0; i < maxToolIterations; i++) {
      // Check abort before each LLM call
      if (abortSignal?.aborted) {
        return {
          messages,
          output: { type: "error", message: "Aborted by user" },
          toolCalls: allToolResults,
          thinking: allThinking,
        };
      }

      const turn = i + 1;
      const lastUserContent = messages[messages.length - 1]?.content ?? "";
      onPhase?.({
        type: "model_call_start",
        agentId,
        turn,
        summary: suppressProgressPhases
          ? "Responding"
          : describeModelTurnStart(agentId, turn, lastUserContent),
      });

      let singleTurnResult = await this.singleTurn(
        messages,
        onDelta,
        (chunk) => {
          if (!suppressProgressPhases) {
            onPhase?.({ type: "thinking", agentId, delta: chunk });
          }
        },
        abortSignal,
      );
      for (let r = 0; r < MAX_429_RETRIES && singleTurnResult.error?.startsWith("HTTP 429"); r++) {
        // Respect the upstream Retry-After header; default to 60 s (NIM per-minute limit)
        const delay = singleTurnResult.retryAfterMs ?? 60_000;
        try {
          await sleepMs(delay, abortSignal);
        } catch {
          singleTurnResult = { text: "", error: "Aborted" };
          break;
        }
        singleTurnResult = await this.singleTurn(
          messages,
          onDelta,
          (chunk) => {
            if (!suppressProgressPhases) {
              onPhase?.({ type: "thinking", agentId, delta: chunk });
            }
          },
          abortSignal,
        );
      }
      const { text, error } = singleTurnResult;

      if (error) {
        const isAbort = error === "Aborted";
        return {
          messages,
          output: { type: "error", message: isAbort ? "Stopped by user" : error },
          toolCalls: allToolResults,
          thinking: allThinking,
        };
      }

      // If model returned empty text, nudge it to continue
      if (!text.trim()) {
        messages.push({
          role: "user" as const,
          content:
            "Please continue. Call the next tool or write your final response.",
        });
        continue;
      }

      const toolCalls: ToolCallRequest[] = [];
      let textContent = "";

      const parser = new StreamParser((chunk) => {
        if (chunk.type === "text") {
          textContent += chunk.content;
        } else if (chunk.type === "thinking") {
          const step: ThinkingStep = { agentId, content: chunk.content };
          allThinking.push(step);
          if (!suppressProgressPhases) {
            onPhase?.({ type: "thinking", agentId, delta: chunk.content });
          }
        } else if (chunk.type === "status") {
          if (!suppressProgressPhases) {
            onPhase?.({ type: "status", agentId, message: chunk.content });
          }
        } else if (chunk.type === "next") {
          if (!suppressProgressPhases) {
            onPhase?.({ type: "next", agentId, message: chunk.content });
          }
        } else if (chunk.type === "tool_call") {
          toolCallCounter += 1;
          toolCalls.push({
            ...chunk.call,
            id: `tc_${toolCallCounter}`,
          });
        }
      });
      parser.push(text);
      parser.finish();

      if (toolCalls.length === 0) {
        const recovered = recoverToolCallFromText(
          text,
          agentId,
          `tc_${++toolCallCounter}`,
        );
        if (recovered) {
          toolCalls.push(recovered);
        }
      }

      const turnSummary = summarizeModelTurnResult(toolCalls, textContent.trim() || text.trim());
      if (!suppressProgressPhases) {
        onPhase?.({
          type: "model_call_end",
          agentId,
          turn,
          summary: turnSummary.summary,
          ...(turnSummary.detail ? { detail: turnSummary.detail } : {}),
        });
      }

      messages.push({ role: "assistant", content: text });

      if (toolCalls.length === 0) {
        const candidateFinalText = textContent.trim() || text.trim();
        const visibleFinalText = stripNonResponseMarkup(candidateFinalText);
        const successfulResults = allToolResults.filter((result) => !result.error);
        const readFileCount = successfulResults.filter((result) => result.name === "read_file").length;
        const directoryCount = successfulResults.filter((result) => result.name === "list_directory").length;
        const shouldForceMoreExploration =
          repoReadNudges < 3 &&
          (agentId === "file-picker" || agentId === "reader") &&
          isBroadRepoExplanationPrompt(prompt) &&
          (readFileCount < 8 || directoryCount < 4 || isPrematureRepoExplanation(candidateFinalText));

        if (shouldForceMoreExploration) {
          repoReadNudges += 1;
          messages.push({
            role: "user" as const,
            content:
              "Do not answer yet. Keep exploring the repository. Read more real files across the main directories, build enough context from the actual codebase, and only then explain it. Do not say 'I can help' or narrate the process as guidance.",
          });
          continue;
        }

        if (!visibleFinalText) {
          messages.push({
            role: "user" as const,
            content:
              "You only emitted progress updates. Continue by calling the next tool or writing the final answer.",
          });
          continue;
        }

        finalText = visibleFinalText;
        break;
      }

      // Execute tool calls sequentially; collect all result blocks then push as
      // one user message to avoid consecutive same-role messages (which NVIDIA
      // NIM rejects with 422, surfaced as 502 from the web route).
      const resultBlocks: string[] = [];
      const invalidToolFeedbackBlocks: string[] = [];
      let successfulToolCallsThisTurn = 0;
      let failedToolCallsThisTurn = 0;
      for (const originalCall of toolCalls) {
        const call = normalizeToolCall(originalCall);
        const missingParams = getMissingRequiredParams(call);
        if (missingParams.length > 0) {
          invalidToolFeedbackBlocks.push(
            `<tool_result name="${call.name}" id="${call.id}">\nInvalid tool call: missing required parameter(s): ${missingParams.join(", ")}. Retry the same tool with valid JSON arguments. If you do not know the path yet, inspect the repository first instead of sending empty {}.\n</tool_result>`,
          );
          continue;
        }

        // For write_file, cache original content before overwriting for potential revert
        if (call.name === "write_file" && onFileChangeReview) {
          const filePath = call.parameters["path"] as string | undefined;
          if (filePath) {
            try {
              const { readFile } = await import("node:fs/promises");
              const original = await readFile(filePath, "utf-8");
              originalFileContent.set(call.id, original);
            } catch {
              // File may not exist yet; revert will be a no-op
            }
          }
        }

        onPhase?.({ type: "tool_call", agentId, call });
        const result =
          call.name === "ask_user" && onUserQuestion
            ? {
                id: call.id,
                name: call.name,
                output: JSON.stringify({
                  paused: false,
                  supported: true,
                  questions: parseAskUserQuestions(call.parameters),
                  answer: await onUserQuestion(
                    parseAskUserQuestions(call.parameters),
                  ),
                }),
              }
            : toolExecutor
              ? await toolExecutor(call, {
                  messages: [...messages],
                  agentId,
                  prompt,
                })
              : await executeToolCall(call);

        // File change review gate for str_replace and write_file
        if (
          !result.error &&
          (call.name === "str_replace" || call.name === "write_file") &&
          onFileChangeReview
        ) {
          const filePath = (call.parameters["path"] as string | undefined) ?? "";
          const oldStr =
            (call.parameters["old_string"] as string | undefined) ??
            originalFileContent.get(call.id) ??
            "";
          const newStr =
            (call.parameters["new_string"] as string | undefined) ??
            (call.parameters["content"] as string | undefined) ??
            "";

          const feedback = await onFileChangeReview(call.id, filePath, oldStr, newStr);

          if (feedback.decision === "revert") {
            // Undo the change
            if (call.name === "str_replace" && oldStr && newStr && filePath) {
              await executeToolCall({
                id: call.id + "_revert",
                name: "str_replace",
                parameters: { path: filePath, old_string: newStr, new_string: oldStr },
              });
            } else if (call.name === "write_file" && filePath) {
              const original = originalFileContent.get(call.id);
              if (original !== undefined) {
                await executeToolCall({
                  id: call.id + "_revert",
                  name: "write_file",
                  parameters: { path: filePath, content: original },
                });
              }
            }
            // Tell the model the change was rejected
            resultBlocks.push(`<tool_result name="${call.name}" id="${call.id}">\nUser rejected this change and it has been reverted. Please try a different approach.\n</tool_result>`);
            continue;
          }

          if (feedback.decision === "feedback") {
            // Append user feedback to the tool result
            allToolResults.push(result);
            onPhase?.({ type: "tool_result", agentId, result });
            successfulToolCallsThisTurn += 1;
            resultBlocks.push(`<tool_result name="${call.name}" id="${call.id}">\n${result.output}\nUser feedback: ${feedback.message}\n</tool_result>`);
            continue;
          }
          // "keep" — fall through to normal emission
        }

        allToolResults.push(result);
        onPhase?.({ type: "tool_result", agentId, result });
        if (result.error) failedToolCallsThisTurn += 1;
        else successfulToolCallsThisTurn += 1;

        if (call.name === "set_output") {
          forcedFinalOutput = normalizeToolOutputValue(call.parameters["data"]);
        }

        if (call.name === "set_messages") {
          const parsed = parseMessageArray(call.parameters["messages"]);
          const mode =
            call.parameters["mode"] === "append" ? "append" : "replace";
          if (parsed) {
            messages = mode === "append" ? [...messages, ...parsed] : [...parsed];
          }
        }

        if (call.name === "task_completed") {
          const summary = normalizeToolOutputValue(call.parameters["summary"]);
          if (summary && !forcedFinalOutput) {
            forcedFinalOutput = summary;
          }
          taskCompleted = true;
        }

        resultBlocks.push(`<tool_result name="${result.name}" id="${result.id}">\n${result.output}\n</tool_result>`);
      }

      // Push all tool results as a single user message so the message array
      // always alternates between roles (user → assistant → user → …).
      if (resultBlocks.length > 0 || invalidToolFeedbackBlocks.length > 0) {
        messages.push({
          role: "user",
          content: [...resultBlocks, ...invalidToolFeedbackBlocks].join("\n\n"),
        });
      }

      if (successfulToolCallsThisTurn === 0 && failedToolCallsThisTurn > 0) {
        consecutiveFailedToolOnlyTurns += 1;
      } else {
        consecutiveFailedToolOnlyTurns = 0;
      }

      if (consecutiveFailedToolOnlyTurns >= 2) {
        messages.push({
          role: "user",
          content:
            "Several recent tool calls failed without yielding new context. Re-evaluate your approach. Use confirmed paths from list_directory results, avoid repeating missing-file lookups, and prefer read_subtree, list_directory, read_file, or code_search/search_text only when their required parameters are present.",
        });
        consecutiveFailedToolOnlyTurns = 0;
      }

      if (taskCompleted) {
        finalText = forcedFinalOutput ?? (textContent.trim() || text.trim());
        break;
      }
    }

    const finalMessages =
      finalText &&
      !(
        messages.at(-1)?.role === "assistant" &&
        messages.at(-1)?.content.trim() === finalText.trim()
      )
        ? [...messages, { role: "assistant" as const, content: finalText }]
        : messages;

    return {
      messages: finalMessages,
      output: { type: "text", content: finalText },
      toolCalls: allToolResults,
      thinking: allThinking,
    };
  }
}

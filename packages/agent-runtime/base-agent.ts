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
import { StreamParser, sanitizeJsonLiterals } from "./tools/parser.ts";
import { executeToolCall } from "./tools/local-runner.ts";

export type FileChangeFeedback =
  | { decision: "keep" }
  | { decision: "revert" }
  | { decision: "feedback"; message: string };

export type AgentRunOptions = {
  prompt: string;
  agentId?: AgentId;
  systemPrompt?: string;
  previousMessages?: Message[];
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
): ToolCallRequest | null {
  if (!["file-picker", "reader", "executor"].includes(agentId)) {
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
      id: "tc_recovered",
      name,
      parameters: parsed,
    };
  }

  return null;
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

  constructor(private readonly endpoint: string) {}

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
      previousMessages = [],
      onDelta,
      onPhase,
      maxToolIterations = 8,
      abortSignal,
      onFileChangeReview,
    } = options;

    let messages: Message[];

    if (systemPrompt) {
      messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: prompt },
      ];
    } else if (previousMessages.length > 0) {
      messages = [
        ...previousMessages,
        { role: "user" as const, content: prompt },
      ];
    } else {
      messages = [{ role: "user" as const, content: prompt }];
    }

    const allToolResults: ToolCallResult[] = [];
    const allThinking: ThinkingStep[] = [];
    let finalText = "";

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

      let singleTurnResult = await this.singleTurn(messages, onDelta, abortSignal);
      for (let r = 0; r < MAX_429_RETRIES && singleTurnResult.error?.startsWith("HTTP 429"); r++) {
        // Respect the upstream Retry-After header; default to 60 s (NIM per-minute limit)
        const delay = singleTurnResult.retryAfterMs ?? 60_000;
        try {
          await sleepMs(delay, abortSignal);
        } catch {
          singleTurnResult = { text: "", error: "Aborted" };
          break;
        }
        singleTurnResult = await this.singleTurn(messages, onDelta, abortSignal);
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
          onPhase?.({ type: "thinking", agentId, delta: chunk.content });
        } else if (chunk.type === "tool_call") {
          toolCalls.push(chunk.call);
        }
      });
      parser.push(text);
      parser.finish();

      if (toolCalls.length === 0) {
        const recovered = recoverToolCallFromText(text, agentId);
        if (recovered) {
          toolCalls.push(recovered);
        }
      }

      messages.push({ role: "assistant", content: text });

      if (toolCalls.length === 0) {
        finalText = textContent.trim() || text.trim();
        break;
      }

      // Execute tool calls sequentially; collect all result blocks then push as
      // one user message to avoid consecutive same-role messages (which NVIDIA
      // NIM rejects with 422, surfaced as 502 from the web route).
      const resultBlocks: string[] = [];
      for (const call of toolCalls) {
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

        onPhase?.({ type: "tool_call", call });
        const result = await executeToolCall(call);

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
            onPhase?.({ type: "tool_result", result });
            resultBlocks.push(`<tool_result name="${call.name}" id="${call.id}">\n${result.output}\nUser feedback: ${feedback.message}\n</tool_result>`);
            continue;
          }
          // "keep" — fall through to normal emission
        }

        allToolResults.push(result);
        onPhase?.({ type: "tool_result", result });

        resultBlocks.push(`<tool_result name="${result.name}" id="${result.id}">\n${result.output}\n</tool_result>`);
      }

      // Push all tool results as a single user message so the message array
      // always alternates between roles (user → assistant → user → …).
      if (resultBlocks.length > 0) {
        messages.push({ role: "user", content: resultBlocks.join("\n\n") });
      }
    }

    return {
      messages: [...messages, { role: "assistant", content: finalText }],
      output: { type: "text", content: finalText },
      toolCalls: allToolResults,
      thinking: allThinking,
    };
  }
}

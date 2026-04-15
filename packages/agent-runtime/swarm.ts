import type {
  AgentId,
  AgentPhase,
  Message,
  SwarmState,
  ToolCallRequest,
  ToolName,
} from "@santra/shared";
import { BaseAgent } from "./base-agent.ts";
import { executeToolCall } from "./tools/local-runner.ts";
import { sanitizeJsonLiterals } from "./tools/parser.ts";
import { AGENT_PROMPTS } from "../../agents/index.ts";

import type { FileChangeFeedback } from "./base-agent.ts";

export type SwarmOptions = {
  task: string;
  endpoint: string;
  previousMessages?: Message[];
  onPhase?: (phase: AgentPhase) => void;
  abortSignal?: AbortSignal;
  onFileChangeReview?: (
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
};

// ─── Orchestrator plan shape ───────────────────────────────────────────────

type OrchestratorPlan = {
  task_type: "direct" | "read" | "write";
  direct_answer?: string;
};

function parsePlan(text: string): OrchestratorPlan | null {
  try {
    const clean = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1)) as OrchestratorPlan;
  } catch {
    return null;
  }
}

function isDirectAnswer(plan: OrchestratorPlan | null): boolean {
  return (
    plan?.task_type === "direct" &&
    typeof plan.direct_answer === "string" &&
    plan.direct_answer.trim().length > 0
  );
}

// ─── JSON helpers ──────────────────────────────────────────────────────────

function parseToolOutput(output: string): Record<string, unknown> | null {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getReadPaths(results: SwarmState["toolCallResults"]): string[] {
  return Array.from(
    new Set(
      results.flatMap((r) => {
        if (r.name !== "read_file" || r.error) return [];
        const parsed = parseToolOutput(r.output);
        const path = parsed?.["path"];
        return typeof path === "string" ? [path] : [];
      }),
    ),
  );
}

function getWrittenPaths(results: SwarmState["toolCallResults"]): string[] {
  return Array.from(
    new Set(
      results.flatMap((r) => {
        if ((r.name !== "write_file" && r.name !== "str_replace") || r.error) return [];
        const parsed = parseToolOutput(r.output);
        const path = parsed?.["path"];
        return typeof path === "string" ? [path] : [];
      }),
    ),
  );
}

// Extract file contents from read_file tool results so downstream agents
// don't need to re-read (and can't hallucinate paths).
const MAX_CONTEXT_CHARS = 80_000; // hard cap on total inlined file content

function buildFileContext(results: SwarmState["toolCallResults"]): string {
  const sections: string[] = [];
  let total = 0;

  for (const r of results) {
    if (r.name !== "read_file" || r.error) continue;
    const parsed = parseToolOutput(r.output);
    const path = parsed?.["path"];
    const content = parsed?.["content"];
    if (typeof path !== "string" || typeof content !== "string") continue;
    if (total >= MAX_CONTEXT_CHARS) {
      sections.push(`--- ${path} (omitted — context limit reached) ---`);
      continue;
    }
    const snippet = content.slice(0, MAX_CONTEXT_CHARS - total);
    sections.push(`--- ${path} ---\n${snippet}`);
    total += snippet.length;
  }

  return sections.join("\n\n");
}

// Extract directory listing entries from list_directory results.
function buildDirectoryContext(results: SwarmState["toolCallResults"]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.name !== "list_directory" || r.error) continue;
    const parsed = parseToolOutput(r.output);
    const path = parsed?.["path"];
    const entries = parsed?.["entries"];
    if (typeof path !== "string" || !Array.isArray(entries)) continue;
    const names = (entries as Array<{ name: string; type: string }>)
      .map((e) => `  ${e.type === "directory" ? "[dir]" : "[file]"} ${e.name}`)
      .join("\n");
    lines.push(`${path}/\n${names}`);
  }
  return lines.join("\n\n");
}

// Extract a {path, content} write payload from bare text (model forgot tool format)
function extractWritePayload(
  text: string,
): { path: string; content: string } | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  const candidates: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const c of candidates) {
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(c) as Record<string, unknown>; } catch {
      try { parsed = JSON.parse(sanitizeJsonLiterals(c)) as Record<string, unknown>; } catch { continue; }
    }
    if (!parsed) continue;
    const path = parsed["path"];
    const content = parsed["content"];
    if (typeof path === "string" && typeof content === "string") {
      return { path, content };
    }
  }
  return null;
}

// Strip raw <tool_call>/<tool_result> XML that leaked into a delta buffer
function stripToolXml(s: string): string {
  return s
    .replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, "")
    .trim();
}

// ─── Swarm ─────────────────────────────────────────────────────────────────

export class Swarm {
  private agent: BaseAgent;

  constructor(endpoint: string) {
    this.agent = new BaseAgent(endpoint);
  }

  async run(options: SwarmOptions): Promise<SwarmState> {
    const { task, onPhase, abortSignal, onFileChangeReview } = options;

    const phases: AgentPhase[] = [];
    const toolCallResults: SwarmState["toolCallResults"] = [];
    const thinkingSteps: SwarmState["thinkingSteps"] = [];
    let manualToolCounter = 0;

    const emit = (phase: AgentPhase) => {
      phases.push(phase);
      onPhase?.(phase);
    };

    const runManualTool = async (
      name: ToolName,
      parameters: Record<string, unknown>,
    ) => {
      manualToolCounter++;
      const call: ToolCallRequest = { id: `manual_${manualToolCounter}`, name, parameters };
      emit({ type: "tool_call", call });
      const result = await executeToolCall(call);
      emit({ type: "tool_result", result });
      toolCallResults.push(result);
      return result;
    };

    type AgentOutcome = { output: string; toolResults: SwarmState["toolCallResults"]; error?: string };

    const runAgent = async (
      agentId: AgentId,
      prompt: string,
      maxIter = 8,
    ): Promise<AgentOutcome> => {
      emit({ type: "agent_start", agentId, task: prompt.slice(0, 120) });

      let agentBuffer = "";
      const localToolResults: SwarmState["toolCallResults"] = [];

      // Check abort before running each sub-agent
      if (abortSignal?.aborted) {
        return { output: "", toolResults: localToolResults, error: "Aborted by user" };
      }

      const result = await this.agent.run({
        prompt,
        agentId,
        systemPrompt: AGENT_PROMPTS[agentId],
        maxToolIterations: maxIter,
        abortSignal,
        onFileChangeReview,
        onDelta: (chunk) => {
          agentBuffer += chunk;
          emit({ type: "delta", agentId, content: chunk });
        },
        onPhase: (phase) => {
          if (phase.type === "tool_call") {
            emit({ type: "tool_call", call: phase.call });
          } else if (phase.type === "tool_result") {
            emit({ type: "tool_result", result: phase.result });
            toolCallResults.push(phase.result);
            localToolResults.push(phase.result);
          } else if (phase.type === "thinking") {
            thinkingSteps.push({ agentId, content: phase.delta });
            emit({ type: "thinking", agentId, delta: phase.delta });
          }
        },
      });

      if (result.output.type === "error") {
        return { output: "", toolResults: localToolResults, error: result.output.message };
      }

      const rawOutput =
        result.output.type === "text" ? result.output.content : "";
      const finalOutput = rawOutput.trim() || stripToolXml(agentBuffer);

      emit({ type: "agent_done", agentId, output: finalOutput });
      return { output: finalOutput, toolResults: localToolResults };
    };

    // ── 1. Orchestrator ────────────────────────────────────────────────────
    const orchResult = await runAgent("orchestrator", task, 1);
    if (orchResult.error) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `Orchestrator failed: ${orchResult.error}` };
    }

    const plan = parsePlan(orchResult.output);

    // ── TIER 1: direct — orchestrator's answer IS the response ─────────────
    if (isDirectAnswer(plan)) {
      const finalOutput = plan!.direct_answer!;
      emit({ type: "done", finalOutput });
      return { phases, finalOutput, toolCallResults, thinkingSteps };
    }

    // Check abort between stages
    if (abortSignal?.aborted) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: "Aborted by user" };
    }

    // ── TIER 2: read — single reader agent answers directly ─────────────────
    if (plan?.task_type === "read") {
      const readerPromptText = `Task: ${task}\n\nStart with list_directory path="." to understand the full project structure. Explore subdirectories. Read all relevant files thoroughly.`;
      const readerResult = await runAgent("reader", readerPromptText, 24);
      if (readerResult.error) {
        return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `Reader failed: ${readerResult.error}` };
      }
      const finalOutput = readerResult.output;
      emit({ type: "done", finalOutput });
      return { phases, finalOutput, toolCallResults, thinkingSteps };
    }

    // Check abort before write pipeline
    if (abortSignal?.aborted) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: "Aborted by user" };
    }

    // ── TIER 3: write — file-picker → executor ──────────────────────────────
    const filePickerPromptText = `Task: ${task}\n\nStart with list_directory path="." to understand the full project structure. Explore all relevant subdirectories. Read every file that relates to the task — be thorough.`;
    const filePickerResult = await runAgent("file-picker", filePickerPromptText, 24);
    if (filePickerResult.error) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `File-picker failed: ${filePickerResult.error}` };
    }

    const filesRead = getReadPaths(filePickerResult.toolResults);

    // Fallback: if file-picker read nothing, manually read root manifest files
    if (filesRead.length === 0) {
      const rootList = await runManualTool("list_directory", { path: "." });
      const rootEntries = (() => {
        const parsed = parseToolOutput(rootList.output);
        const entries = parsed?.["entries"];
        return Array.isArray(entries) ? entries : [];
      })();
      const manifests = ["README.md", "package.json", "go.mod", "Cargo.toml", "pyproject.toml"];
      for (const name of manifests) {
        const found = rootEntries.find(
          (e): e is { name: string; path: string } =>
            !!e && typeof e === "object" && (e as { name?: unknown }).name === name,
        );
        if (found) await runManualTool("read_file", { path: found.path });
      }
    }

    const inlinedFiles = buildFileContext(filePickerResult.toolResults);
    const directoryContext = buildDirectoryContext(filePickerResult.toolResults);

    // Check abort before executor
    if (abortSignal?.aborted) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: "Aborted by user" };
    }

    const executorPromptText = [
      `Task: ${task}`,
      directoryContext
        ? `Project structure:\n${directoryContext}`
        : "",
      inlinedFiles
        ? `File contents (already read — do NOT re-read these):\n\n${inlinedFiles}`
        : filesRead.length > 0
          ? `Files identified:\n${filesRead.map((f) => `- ${f}`).join("\n")}`
          : "Use list_directory and read_file to explore the project before making any changes.",
      inlinedFiles
        ? "IMPORTANT: Only access file paths shown in the project structure above. Do not invent paths."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const execResult = await runAgent("executor", executorPromptText, 20);
    if (execResult.error) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `Executor failed: ${execResult.error}` };
    }

    // Recovery: if executor output raw JSON instead of using write_file tool
    if (getWrittenPaths(execResult.toolResults).length === 0) {
      const recovered = extractWritePayload(execResult.output);
      if (recovered) {
        await runManualTool("write_file", recovered);
      }
    }

    const finalOutput = execResult.output;
    emit({ type: "done", finalOutput });
    return { phases, finalOutput, toolCallResults, thinkingSteps };
  }
}

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

function isBroadRepoExplanationTask(task: string): boolean {
  const lower = task.toLowerCase();
  return (
    lower.includes("whole codebase") ||
    lower.includes("entire codebase") ||
    lower.includes("read the whole") ||
    lower.includes("explain me everything") ||
    lower.includes("explain everything") ||
    lower.includes("make me understand") ||
    lower.includes("whole repo") ||
    lower.includes("entire repository")
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

    type AgentOutcome = {
      output: string;
      toolResults: SwarmState["toolCallResults"];
      error?: string;
      bufferedPhases?: AgentPhase[];
    };

    const runAgent = async (
      agentId: AgentId,
      prompt: string,
      maxIter = 8,
      opts?: { bufferPhases?: boolean },
    ): Promise<AgentOutcome> => {
      const bufferedPhases: AgentPhase[] = [];
      const forwardPhase = (phase: AgentPhase) => {
        if (opts?.bufferPhases) bufferedPhases.push(phase);
        else emit(phase);
      };

      forwardPhase({ type: "agent_start", agentId, task: prompt.slice(0, 120) });

      let agentBuffer = "";
      const localToolResults: SwarmState["toolCallResults"] = [];

      // Check abort before running each sub-agent
      if (abortSignal?.aborted) {
        return {
          output: "",
          toolResults: localToolResults,
          error: "Aborted by user",
          bufferedPhases,
        };
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
          forwardPhase({ type: "delta", agentId, content: chunk });
        },
        onPhase: (phase) => {
          if (phase.type === "tool_call") {
            forwardPhase({ type: "tool_call", call: phase.call });
          } else if (phase.type === "tool_result") {
            forwardPhase({ type: "tool_result", result: phase.result });
            toolCallResults.push(phase.result);
            localToolResults.push(phase.result);
          } else if (phase.type === "thinking") {
            thinkingSteps.push({ agentId, content: phase.delta });
            forwardPhase({ type: "thinking", agentId, delta: phase.delta });
          } else if (phase.type === "status") {
            forwardPhase(phase);
          } else if (phase.type === "next") {
            forwardPhase(phase);
          } else if (phase.type === "model_call_end") {
            // Only surface model-call summaries when the turn produced a final
            // explanation instead of immediately choosing more tool work.
            if (!phase.detail?.startsWith("Next tools:")) {
              forwardPhase(phase);
            }
          }
        },
      });

      if (result.output.type === "error") {
        return {
          output: "",
          toolResults: localToolResults,
          error: result.output.message,
          bufferedPhases,
        };
      }

      const rawOutput =
        result.output.type === "text" ? result.output.content : "";
      const finalOutput = rawOutput.trim() || stripToolXml(agentBuffer);

      forwardPhase({ type: "agent_done", agentId, output: finalOutput });
      return { output: finalOutput, toolResults: localToolResults, bufferedPhases };
    };

    // ── 1. Orchestrator ────────────────────────────────────────────────────
    const orchResult = await runAgent("orchestrator", task, 1, { bufferPhases: true });
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

    for (const phase of orchResult.bufferedPhases ?? []) {
      emit(phase);
    }

    // Check abort between stages
    if (abortSignal?.aborted) {
      return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: "Aborted by user" };
    }

    const filePickerPromptText = `Task: ${task}\n\nStart with list_directory path="." to understand the full project structure. Explore all relevant subdirectories. Read every file that relates to the task — be thorough.`;

    // ── TIER 2: read — file-picker → reader ─────────────────────────────────
    if (plan?.task_type === "read") {
      let filePickerResult = await runAgent("file-picker", filePickerPromptText, 24);
      if (filePickerResult.error) {
        return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `File-picker failed: ${filePickerResult.error}` };
      }

      const broadRepoExplanation = isBroadRepoExplanationTask(task);
      let combinedToolResults = [...filePickerResult.toolResults];
      let filesRead = getReadPaths(combinedToolResults);

      if (broadRepoExplanation && filesRead.length < 8) {
        const followupFilePicker = await runAgent(
          "file-picker",
          `Task: ${task}\n\nYou have not read enough of the repository yet. Continue exploring the main directories. Read many more real source files across core, cli, web, agents, and packages before stopping.`,
          24,
        );
        if (followupFilePicker.error) {
          return { phases, finalOutput: "", toolCallResults, thinkingSteps, error: `File-picker failed: ${followupFilePicker.error}` };
        }
        combinedToolResults = [...combinedToolResults, ...followupFilePicker.toolResults];
        filesRead = getReadPaths(combinedToolResults);
      }

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

      const inlinedFiles = buildFileContext(combinedToolResults);
      const directoryContext = buildDirectoryContext(combinedToolResults);

      const readerPromptText = [
        `Task: ${task}`,
        directoryContext
          ? `Project structure:\n${directoryContext}`
          : "",
        inlinedFiles
          ? `File contents already gathered:\n\n${inlinedFiles}`
          : filesRead.length > 0
            ? `Files already read:\n${filesRead.map((f) => `- ${f}`).join("\n")}`
            : "Continue exploring the repository with list_directory, search_text, search_files, and read_file before answering.",
        inlinedFiles
          ? "Write a high-signal explanation using the gathered repository context. Focus on architecture, execution flow, and important modules. Do not include setup chatter, generic guidance, or line-by-line config recaps."
          : "Do not answer until you have enough repository context from actual files.",
      ]
        .filter(Boolean)
        .join("\n\n");

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

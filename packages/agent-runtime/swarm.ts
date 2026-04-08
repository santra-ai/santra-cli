import type { AgentId, AgentPhase, SwarmState, Message } from "@santra/shared";
import { BaseAgent } from "./base-agent.ts";
import { AGENT_PROMPTS } from "../../agents/index.ts";

export type SwarmOptions = {
  task: string;
  endpoint: string;
  previousMessages?: Message[];
  onPhase?: (phase: AgentPhase) => void;
};

type OrchestratorPlan = {
  task_type: "conversation" | "read_only" | "write" | "analysis";
  summary: string;
  needs_files: boolean;
  file_hints: string[];
  steps: string[];
  complexity: "low" | "medium" | "high";
  direct_answer?: string;
};

function parsePlan(text: string): OrchestratorPlan | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as OrchestratorPlan;
  } catch {
    return null;
  }
}

export class Swarm {
  private agent: BaseAgent;

  constructor(endpoint: string) {
    this.agent = new BaseAgent(endpoint);
  }

  async run(options: SwarmOptions): Promise<SwarmState> {
    const { task, onPhase, previousMessages = [] } = options;

    const phases: AgentPhase[] = [];
    const toolCallResults: SwarmState["toolCallResults"] = [];
    const thinkingSteps: SwarmState["thinkingSteps"] = [];

    const emit = (phase: AgentPhase) => {
      phases.push(phase);
      onPhase?.(phase);
    };

    const runAgent = async (agentId: AgentId, prompt: string, maxIter = 6) => {
      emit({ type: "agent_start", agentId, task: prompt.slice(0, 120) });
      const promptWithSystem = `${AGENT_PROMPTS[agentId]}\n\n${prompt}`;
      const result = await this.agent.run({
        prompt: promptWithSystem,
        onDelta: (chunk) => {
          thinkingSteps.push({ agentId, content: chunk });
          emit({ type: "thinking", agentId, delta: chunk });
        },
      });
      const output = result.output.type === "text" ? result.output.content : "";
      emit({ type: "agent_done", agentId, output });
      return output;
    };

    // ── 1. Orchestrator ────────────────────────────────────────────────────────
    const orchOutput = await runAgent("orchestrator", task, 1);
    const plan = parsePlan(orchOutput);

    // Fast path: conversation or low-complexity with a direct answer
    if (
      plan?.direct_answer ||
      plan?.task_type === "conversation" ||
      plan?.complexity === "low"
    ) {
      const finalOutput = plan?.direct_answer ?? orchOutput;
      emit({ type: "done", finalOutput });
      return { phases, finalOutput, toolCallResults, thinkingSteps };
    }

    // ── 2. Thinker ────────────────────────────────────────────────────────────
    const thinkerInput = plan
      ? `Task: ${task}\n\nOrchestrator plan:\n${JSON.stringify(plan, null, 2)}`
      : task;
    const thinkerOutput = await runAgent("thinker", thinkerInput, 1);

    // ── 3. File Picker (only when files needed) ────────────────────────────────
    let fileContext = "";
    if (plan?.needs_files !== false) {
      const hints = plan?.file_hints?.length
        ? `Likely relevant paths: ${plan.file_hints.join(", ")}\n`
        : "";
      fileContext = await runAgent(
        "file-picker",
        `Task: ${task}\n${hints}Use tools to find and read relevant files.`,
        6,
      );
    }

    // ── 4. Planner ─────────────────────────────────────────────────────────────
    const plannerInput = [
      `Task: ${task}`,
      thinkerOutput ? `Analysis:\n${thinkerOutput}` : "",
      fileContext ? `File context:\n${fileContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const executionPlan = await runAgent("planner", plannerInput, 1);

    // ── 5. Executor ────────────────────────────────────────────────────────────
    const executorInput = [
      `Task: ${task}`,
      `Execution plan:\n${executionPlan}`,
      fileContext ? `File context:\n${fileContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const executorOutput = await runAgent("executor", executorInput, 10);

    // ── 6. Reviewer ────────────────────────────────────────────────────────────
    const reviewerInput = [
      `Original task: ${task}`,
      `What the executor did:\n${executorOutput}`,
      "Verify the result and write the final user-facing response.",
    ].join("\n\n");
    const finalOutput = await runAgent("reviewer", reviewerInput, 4);

    emit({ type: "done", finalOutput });
    return { phases, finalOutput, toolCallResults, thinkingSteps };
  }
}

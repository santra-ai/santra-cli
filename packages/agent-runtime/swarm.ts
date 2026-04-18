import type {
  AgentId,
  AgentPhase,
  AgentTemplate,
  Message,
  SwarmState,
  ToolCallRequest,
  ToolCallResult,
} from "@santra/shared";
import { BaseAgent } from "./base-agent.ts";
import { executeToolCall } from "./tools/local-runner.ts";
import { getAgentTemplate, loadAgentTemplates } from "./agent-registry.ts";
import { runProgrammaticAgent } from "./programmatic-runner.ts";

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

type AgentOutcome = {
  output: string;
  messages: Message[];
  error?: string;
};

type SpawnSpec = {
  agent: string;
  task: string;
};

function buildInheritedMessages(
  template: Pick<AgentTemplate, "systemPrompt" | "includeMessageHistory">,
  messages: Message[],
): Message[] {
  const recentMessages = template.includeMessageHistory
    ? messages.filter((message) => message.role !== "system")
    : messages.filter((message) => message.role !== "system").slice(-10);

  if (!template.systemPrompt?.trim()) {
    return [...recentMessages];
  }

  return [{ role: "system", content: template.systemPrompt }, ...recentMessages];
}

function summarizeToolOutput(output: string, maxChars = 8_000): string {
  const trimmed = output.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[...truncated...]`;
}

function fallbackFinalOutput(task: string): string {
  const normalized = task.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "I finished the run, but I did not produce a visible final response.";
  }
  return `I finished working on "${normalized}", but I did not produce a visible final response.`;
}

function parseSpawnSpecs(value: unknown): SpawnSpec[] | null {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is SpawnSpec =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { agent?: unknown }).agent === "string" &&
          typeof (item as { task?: unknown }).task === "string",
      )
      .map((item) => ({
        agent: item.agent,
        task: item.task,
      }));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseSpawnSpecs(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export class Swarm {
  private agent: BaseAgent;

  constructor(endpoint: string) {
    this.agent = new BaseAgent(endpoint);
  }

  async run(options: SwarmOptions): Promise<SwarmState> {
    const { task, onPhase, abortSignal, onFileChangeReview, previousMessages } =
      options;

    const phases: AgentPhase[] = [];
    const toolCallResults: ToolCallResult[] = [];
    const thinkingSteps: SwarmState["thinkingSteps"] = [];

    const emit = (phase: AgentPhase) => {
      phases.push(phase);
      onPhase?.(phase);
    };

    const { validationErrors } = await loadAgentTemplates();
    if (validationErrors.length > 0) {
      emit({
        type: "status",
        agentId: "orchestrator",
        message: `Agent template warning: ${validationErrors[0]?.message ?? "Unknown validation issue"}`,
      });
    }

    const runAgent = async (
      agentId: AgentId,
      prompt: string,
      opts?: {
        previousMessages?: Message[];
        maxToolIterations?: number;
        parentTemplate?: AgentTemplate;
      },
    ): Promise<AgentOutcome> => {
      const template = await getAgentTemplate(agentId);
      if (!template) {
        return {
          output: "",
          messages: opts?.previousMessages ?? [],
          error: `Unknown agent '${agentId}'`,
        };
      }

      emit({ type: "agent_start", agentId, task: prompt.slice(0, 160) });

      const phaseForwarder = (phase: AgentPhase) => {
        if (phase.type === "thinking") {
          thinkingSteps.push({ agentId, content: phase.delta });
        }
        if (
          phase.type === "thinking" ||
          phase.type === "status" ||
          phase.type === "next" ||
          phase.type === "model_call_start" ||
          phase.type === "model_call_end" ||
          phase.type === "tool_call" ||
          phase.type === "tool_result"
        ) {
          if (phase.type === "tool_result") {
            toolCallResults.push(phase.result);
          }
          emit(phase);
        }
      };

      const toolExecutor = async (
        call: ToolCallRequest,
        context: { messages: Message[]; agentId: AgentId; prompt: string },
      ) => {
        const allowedToolNames = template.toolNames ?? [];
        if (allowedToolNames.length > 0 && !allowedToolNames.includes(call.name)) {
          return {
            id: call.id,
            name: call.name,
            output: JSON.stringify({
              error: `Tool '${call.name}' is not allowed for agent '${template.id}'.`,
            }),
            error: `Tool '${call.name}' is not allowed for agent '${template.id}'.`,
          };
        }

        if (call.name === "lookup_agent_info") {
          const target = String(call.parameters["agent"] ?? "").trim();
          const targetTemplate = target ? await getAgentTemplate(target) : undefined;
          if (!targetTemplate) {
            return {
              id: call.id,
              name: call.name,
              output: JSON.stringify({ error: `Unknown agent '${target}'` }),
              error: `Unknown agent '${target}'`,
            };
          }
          return {
            id: call.id,
            name: call.name,
            output: JSON.stringify({
              id: targetTemplate.id,
              displayName: targetTemplate.displayName,
              description: targetTemplate.description,
              toolNames: targetTemplate.toolNames ?? [],
              spawnableAgents: targetTemplate.spawnableAgents ?? [],
              outputMode: targetTemplate.outputMode ?? "last_message",
              sourceFilePath: targetTemplate._sourceFilePath ?? null,
            }),
          };
        }

        if (call.name !== "spawn_agent" && call.name !== "spawn_agents") {
          if (call.name === "set_output") {
            return {
              id: call.id,
              name: call.name,
              output: JSON.stringify({ ok: true, data: call.parameters["data"] }),
            };
          }

          if (call.name === "task_completed") {
            return {
              id: call.id,
              name: call.name,
              output: JSON.stringify({
                ok: true,
                summary: String(call.parameters["summary"] ?? ""),
              }),
            };
          }

          return executeToolCall(call);
        }

        const spawnOne = async (spec: SpawnSpec) => {
          const childTemplate = await getAgentTemplate(spec.agent);
          if (!childTemplate) {
            return {
              agent: spec.agent,
              task: spec.task,
              error: `unknown agent '${spec.agent}'`,
            };
          }

          if (
            template.spawnableAgents?.length &&
            !template.spawnableAgents.includes(spec.agent)
          ) {
            return {
              agent: spec.agent,
              task: spec.task,
              error: `agent '${template.id}' cannot spawn '${spec.agent}'`,
            };
          }

          const childMessages = buildInheritedMessages(childTemplate, context.messages);
          const childPrompt = [
            `Parent agent: ${context.agentId}`,
            `Parent prompt: ${context.prompt}`,
            `Subtask: ${spec.task}`,
            "Complete only this bounded subtask and return the result to the parent agent.",
          ].join("\n\n");

          const childResult = await runAgent(spec.agent, childPrompt, {
            previousMessages: childMessages,
            maxToolIterations: spec.agent === "thinker" ? 6 : 16,
            parentTemplate: template,
          });

          if (childResult.error) {
            return {
              agent: spec.agent,
              task: spec.task,
              error: childResult.error,
            };
          }

          return {
            agent: spec.agent,
            task: spec.task,
            output: summarizeToolOutput(childResult.output),
          };
        };

        if (call.name === "spawn_agents") {
          const specs = parseSpawnSpecs(call.parameters["agents"]);
          if (!specs?.length) {
            return {
              id: call.id,
              name: call.name,
              output: JSON.stringify({
                error:
                  "spawn_agents: 'agents' must be a JSON array of {agent, task}",
              }),
              error:
                "spawn_agents: 'agents' must be a JSON array of {agent, task}",
            };
          }

          const results = await Promise.all(specs.map(spawnOne));
          const hasErrors = results.some((result) => "error" in result);
          return {
            id: call.id,
            name: call.name,
            output: JSON.stringify(results),
            ...(hasErrors ? { error: "One or more spawned agents failed" } : {}),
          };
        }

        const target = String(call.parameters["agent"] ?? "").trim();
        const subtask = String(call.parameters["task"] ?? "").trim();
        if (!target || !subtask) {
          return {
            id: call.id,
            name: call.name,
            output: JSON.stringify({
              error: "spawn_agent: both 'agent' and 'task' are required",
            }),
            error: "spawn_agent: both 'agent' and 'task' are required",
          };
        }

        const child = await spawnOne({ agent: target, task: subtask });
        return {
          id: call.id,
          name: call.name,
          output: JSON.stringify(child),
          ...("error" in child ? { error: child.error } : {}),
        };
      };

      const systemPrompt = template.inheritParentSystemPrompt
        ? opts?.parentTemplate?.systemPrompt
        : template.systemPrompt;

      const result = template.handleSteps
        ? await runProgrammaticAgent({
            agent: this.agent,
            agentId,
            template,
            prompt,
            messages: opts?.previousMessages ?? [],
            systemPrompt,
            maxToolIterations: opts?.maxToolIterations ?? 20,
            abortSignal,
            onFileChangeReview,
            onDelta: (chunk) => {
              emit({ type: "delta", agentId, content: chunk });
            },
            onPhase: phaseForwarder,
            toolExecutor,
          })
        : await this.agent.run({
            prompt,
            agentId,
            previousMessages: opts?.previousMessages,
            systemPrompt,
            maxToolIterations: opts?.maxToolIterations ?? 20,
            abortSignal,
            onFileChangeReview,
            onDelta: (chunk) => {
              emit({ type: "delta", agentId, content: chunk });
            },
            onPhase: phaseForwarder,
            toolExecutor,
          });

      if ("output" in result && typeof result.output !== "string") {
        if (result.output.type === "error") {
          return {
            output: "",
            messages: result.messages,
            error: result.output.message,
          };
        }

        const output =
          result.output.type === "text"
            ? result.output.content.trim()
            : JSON.stringify(result.output.content);

        emit({ type: "agent_done", agentId, output });
        return {
          output,
          messages: result.messages,
        };
      }

      const output =
        typeof result.output === "string"
          ? result.output.trim()
          : JSON.stringify(result.output);
      emit({ type: "agent_done", agentId, output });
      return {
        output,
        messages: result.messages,
      };
    };

    if (abortSignal?.aborted) {
      return {
        phases,
        finalOutput: "",
        toolCallResults,
        thinkingSteps,
        error: "Aborted by user",
      };
    }

    const rootTemplate = await getAgentTemplate("orchestrator");
    const rootMessages = buildInheritedMessages(
      rootTemplate ?? { systemPrompt: "", includeMessageHistory: false },
      previousMessages ?? [],
    );

    const rootResult = await runAgent("orchestrator", task, {
      previousMessages: rootMessages,
      maxToolIterations: 24,
      parentTemplate: rootTemplate,
    });

    if (rootResult.error) {
      return {
        phases,
        finalOutput: "",
        toolCallResults,
        thinkingSteps,
        error: rootResult.error,
      };
    }

    const finalOutput = rootResult.output.trim() || fallbackFinalOutput(task);
    emit({ type: "done", finalOutput });
    return { phases, finalOutput, toolCallResults, thinkingSteps };
  }
}

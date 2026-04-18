import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  buildToolInstructionsPrompt,
  type AgentTemplate,
  type LoadedAgentTemplates,
} from "@santra/shared";
import { BUILTIN_AGENT_TEMPLATES } from "../../agents/index.ts";

export type AgentValidationError = {
  agentId: string;
  filePath?: string;
  message: string;
};

const AGENT_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const DEFAULT_AGENT_DIRS = [
  resolve(process.cwd(), ".agents"),
  resolve(process.cwd(), "..", ".agents"),
  resolve(process.env["HOME"] ?? "~", ".agents"),
];

function collectFiles(dir: string, acc: string[]): Promise<string[]> {
  return readdir(dir, { withFileTypes: true })
    .then(async (entries) => {
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "skills") continue;
          await collectFiles(fullPath, acc);
          continue;
        }

        const extension = extname(entry.name).toLowerCase();
        if (
          entry.isFile() &&
          AGENT_FILE_EXTENSIONS.has(extension) &&
          !entry.name.endsWith(".d.ts") &&
          !entry.name.endsWith(".test.ts")
        ) {
          acc.push(fullPath);
        }
      }
      return acc;
    })
    .catch(() => acc);
}

function validateAgentTemplate(template: AgentTemplate): string[] {
  const errors: string[] = [];

  if (!template.id?.trim()) {
    errors.push("Agent id is required.");
  }

  if (template.spawnableAgents?.length) {
    if (!template.toolNames?.includes("spawn_agents")) {
      errors.push(
        "Non-empty spawnableAgents array requires the 'spawn_agents' tool.",
      );
    }
  }

  if (
    template.inheritParentSystemPrompt &&
    template.systemPrompt &&
    template.systemPrompt.trim()
  ) {
    errors.push(
      "inheritParentSystemPrompt cannot be combined with systemPrompt.",
    );
  }

  if (
    template.handleSteps !== undefined &&
    typeof template.handleSteps !== "function" &&
    typeof template.handleSteps !== "string"
  ) {
    errors.push("handleSteps must be a function or serialized function string.");
  }

  return errors;
}

function buildTemplateSystemPrompt(template: AgentTemplate): string {
  const parts: string[] = [];

  if (template.systemPrompt?.trim()) {
    parts.push(template.systemPrompt.trim());
  }

  if (template.toolNames?.length && !parts.join("\n").includes("<tools>")) {
    parts.push(buildToolInstructionsPrompt(template.toolNames));
  }

  if (template.instructionsPrompt?.trim()) {
    parts.push(template.instructionsPrompt.trim());
  }

  if (template.spawnableAgents?.length) {
    parts.push(
      [
        "## Spawnable Agents",
        ...template.spawnableAgents.map((agentId) => `- ${agentId}`),
      ].join("\n"),
    );
  }

  return parts.join("\n\n").trim();
}

function normalizeTemplate(template: AgentTemplate): AgentTemplate {
  const normalized: AgentTemplate = { ...template };
  normalized.displayName ??= template.id;
  normalized.outputMode ??= "last_message";
  normalized.systemPrompt = buildTemplateSystemPrompt(normalized);
  return normalized;
}

async function loadFileTemplate(fullPath: string): Promise<AgentTemplate | null> {
  const module = await import(pathToFileURL(fullPath).href);
  const raw = (module.default ?? module) as AgentTemplate | undefined;
  if (!raw?.id) return null;
  return normalizeTemplate({
    ...raw,
    _sourceFilePath: fullPath,
  });
}

let cachedTemplates: LoadedAgentTemplates | null = null;
let cachedErrors: AgentValidationError[] = [];

export async function loadAgentTemplates(options?: {
  forceReload?: boolean;
  includeLocal?: boolean;
  validate?: boolean;
}): Promise<{
  templates: LoadedAgentTemplates;
  validationErrors: AgentValidationError[];
}> {
  const forceReload = options?.forceReload ?? false;
  const includeLocal = options?.includeLocal ?? true;
  const validate = options?.validate ?? true;

  if (cachedTemplates && !forceReload) {
    return {
      templates: cachedTemplates,
      validationErrors: cachedErrors,
    };
  }

  const templates: LoadedAgentTemplates = Object.fromEntries(
    Object.entries(BUILTIN_AGENT_TEMPLATES).map(([id, template]) => [
      id,
      normalizeTemplate(template),
    ]),
  );
  const validationErrors: AgentValidationError[] = [];

  if (includeLocal) {
    const files = (
      await Promise.all(
        DEFAULT_AGENT_DIRS.filter((dir) => existsSync(dir)).map((dir) =>
          collectFiles(dir, []),
        ),
      )
    ).flat();

    for (const fullPath of files) {
      try {
        const template = await loadFileTemplate(fullPath);
        if (!template) continue;
        templates[template.id] = template;
      } catch (error) {
        validationErrors.push({
          agentId: fullPath,
          filePath: fullPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (validate) {
    for (const template of Object.values(templates)) {
      const errors = validateAgentTemplate(template);
      for (const message of errors) {
        validationErrors.push({
          agentId: template.id,
          filePath: template._sourceFilePath,
          message,
        });
      }
    }
  }

  cachedTemplates = templates;
  cachedErrors = validationErrors;

  return {
    templates,
    validationErrors,
  };
}

export async function getAgentTemplate(
  agentId: string,
): Promise<AgentTemplate | undefined> {
  const { templates } = await loadAgentTemplates();
  return templates[agentId];
}

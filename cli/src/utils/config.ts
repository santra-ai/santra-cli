import { join } from "path";
import { randomUUID } from "crypto";
import { getSantraHome } from "./santra-home";

export type Provider =
  | "anthropic"
  | "openai"
  | "nvidia-nim"
  | "groq"
  | "together"
  | "ollama";

export type AuthMode = "santra" | "byok";

export type SantraConfig = {
  version: 2;
  authMode: AuthMode;
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string; // custom base URL for self-hosted NIM, Ollama, etc.
};

export type TrialState = {
  version: 1;
  id: string;
  usedTokens: number;
  remainingTokens: number;
};

export const SANTRA_HOSTED_MODEL = "meta/llama-3.1-8b-instruct";

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic:   "Anthropic (Claude)",
  openai:      "OpenAI (GPT-4o)",
  "nvidia-nim":"Nvidia NIM",
  groq:        "Groq",
  together:    "Together AI",
  ollama:      "Ollama (local)",
};

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  anthropic: [
    "claude-sonnet-4-6",
    "claude-opus-4-7",
    "claude-haiku-4-5",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "o1-mini",
  ],
  "nvidia-nim": [
    "meta/llama-3.1-405b-instruct",
    "meta/llama-3.1-70b-instruct",
    "mistralai/mistral-large",
    "nvidia/nemotron-4-340b-instruct",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
  ],
  together: [
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
  ],
  ollama: [
    "qwen2.5-coder:32b",
    "llama3.1:70b",
    "codestral:latest",
    "deepseek-coder-v2:latest",
  ],
};

// Providers that need a base URL (ollama, self-hosted NIM)
export const NEEDS_BASE_URL: Provider[] = ["ollama", "nvidia-nim"];

const CONFIG_DIR  = getSantraHome();
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const TRIAL_PATH = join(CONFIG_DIR, "trial.json");
const DEFAULT_TRIAL_TOKENS = 10_000;
const APPROX_CHARS_PER_TOKEN = 6;

function ensureConfigDir(): typeof import("fs") {
  const fs = require("fs") as typeof import("fs");
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  return fs;
}

function hostedProvider(): Provider {
  const configured = process.env["NVIDIA_PROVIDER"];
  return configured === "anthropic" ||
    configured === "openai" ||
    configured === "nvidia-nim" ||
    configured === "groq" ||
    configured === "together" ||
    configured === "ollama"
    ? configured
    : "nvidia-nim";
}

export function getDefaultHostedConfig(): SantraConfig {
  return {
    version: 2,
    authMode: "santra",
    provider: hostedProvider(),
    model: SANTRA_HOSTED_MODEL,
    apiKey: "",
  };
}

export function configExists(): boolean {
  try {
    const fs = require("fs") as typeof import("fs");
    return fs.existsSync(CONFIG_PATH);
  } catch {
    return false;
  }
}

export function readConfig(): SantraConfig | null {
  try {
    const fs = require("fs") as typeof import("fs");
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SantraConfig> & {
      version?: number;
      authMode?: AuthMode;
    };
    const authMode = parsed.authMode ?? "byok";
    if (!parsed.provider || !parsed.model) return null;
    if (authMode === "byok" && !parsed.apiKey) return null;
    return {
      version: 2,
      authMode,
      provider: parsed.provider,
      model: parsed.model,
      apiKey: parsed.apiKey ?? "",
      ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
    };
  } catch {
    return null;
  }
}

export function writeConfig(config: SantraConfig): void {
  const fs = ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function deleteConfig(): void {
  try {
    const fs = require("fs") as typeof import("fs");
    fs.unlinkSync(CONFIG_PATH);
  } catch {
    // ignore
  }
}

/** Returns auth headers to attach to every completion request. */
export function getAuthHeaders(config: SantraConfig): Record<string, string> {
  const headers: Record<string, string> =
    config.authMode === "santra"
      ? {
          "x-santra-access-mode": "santra",
        }
      : {
          "x-santra-access-mode": "byok",
          "x-santra-provider": config.provider,
          "x-santra-key": config.apiKey,
          "x-santra-model": config.model,
        };
  if (config.baseUrl) {
    headers["x-santra-base-url"] = config.baseUrl;
  }
  return headers;
}

export function readTrialState(): TrialState {
  try {
    const fs = ensureConfigDir();
    if (!fs.existsSync(TRIAL_PATH)) {
      const initial: TrialState = {
        version: 1,
        id: randomUUID(),
        usedTokens: 0,
        remainingTokens: DEFAULT_TRIAL_TOKENS,
      };
      fs.writeFileSync(TRIAL_PATH, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }

    const raw = fs.readFileSync(TRIAL_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TrialState>;
    if (
      parsed.version !== 1 ||
      typeof parsed.id !== "string" ||
      typeof parsed.usedTokens !== "number" ||
      typeof parsed.remainingTokens !== "number"
    ) {
      throw new Error("Invalid trial state");
    }
    return parsed as TrialState;
  } catch {
    const fs = ensureConfigDir();
    const reset: TrialState = {
      version: 1,
      id: randomUUID(),
      usedTokens: 0,
      remainingTokens: DEFAULT_TRIAL_TOKENS,
    };
    fs.writeFileSync(TRIAL_PATH, JSON.stringify(reset, null, 2), "utf-8");
    return reset;
  }
}

export function writeTrialState(state: TrialState): void {
  const fs = ensureConfigDir();
  fs.writeFileSync(TRIAL_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function consumeTrialTokens(tokens: number): TrialState {
  const current = readTrialState();
  const next: TrialState = {
    ...current,
    usedTokens: current.usedTokens + tokens,
    remainingTokens: Math.max(0, current.remainingTokens - tokens),
  };
  writeTrialState(next);
  return next;
}

export function usingHostedAccess(config: SantraConfig | null): boolean {
  return !config || config.authMode === "santra";
}

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / APPROX_CHARS_PER_TOKEN));
}

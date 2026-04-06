import type { Message, RunState } from "@santra/shared";

export type RunnerOptions = {
  endpoint: string; // /web/api/v1/completions URL
};

export type RunOptions = {
  prompt: string;
  previousMessages?: Message[];
  onDelta?: (chunk: string) => void;
};

export type { RunState };

import type { Message, RunState } from "@santra/shared";

export type RunnerOptions = {
  agentEndpoint: string;
};

export type RunOptions = {
  prompt: string;
  previousMessages?: Message[];
  onDelta?: (chunk: string) => void;
};

export type { RunState };

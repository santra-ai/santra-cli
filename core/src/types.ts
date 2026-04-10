import type { Message, RunState, AgentPhase, SwarmState } from "@santra/shared";

export type RunnerOptions = {
  endpoint: string;
  useSwarm?: boolean;
};

export type RunOptions = {
  prompt: string;
  previousMessages?: Message[];
  onDelta?: (chunk: string) => void;
  onPhase?: (phase: AgentPhase) => void;
  useSwarm?: boolean;
};

export type { RunState, SwarmState };

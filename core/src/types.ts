import type { Message, RunState, AgentPhase, SwarmState } from "@santra/shared";
import type { FileChangeFeedback } from "@santra/agent-runtime";

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
  abortSignal?: AbortSignal;
  onFileChangeReview?: (
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
};

export type { RunState, SwarmState };

import type { MessageRole } from "./types.ts";

export const PALETTE = {
  orange: "#f97316",
  orangeDim: "#7c3a10",
  white: "#f1f5f9",
  muted: "#64748b",
  error: "#ef4444",
} as const;

export const ROLE_LABEL: Record<MessageRole, string> = {
  user: "you",
  agent: "santra",
  error: "error",
};

export const ROLE_LABEL_COLOR: Record<MessageRole, string> = {
  user: PALETTE.white,
  agent: PALETTE.orange,
  error: PALETTE.error,
};

export const ROLE_TEXT_COLOR: Record<MessageRole, string> = {
  user: PALETTE.white,
  agent: PALETTE.white,
  error: PALETTE.error,
};

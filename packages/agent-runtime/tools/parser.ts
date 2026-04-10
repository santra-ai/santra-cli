import type { ToolCallRequest, ToolName } from "@santra/shared";

export type ParsedChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; call: ToolCallRequest };

// Models (especially smaller ones) often emit literal newlines/tabs inside JSON
// string values, which makes JSON.parse() fail. This function escapes bare control
// characters inside string literals so the JSON becomes parseable.
export function sanitizeJsonLiterals(raw: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") result += "\\n";
      else if (ch === "\r") result += "\\r";
      else if (ch === "\t") result += "\\t";
      else result += ch;
    } else {
      result += ch;
    }
  }

  return result;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  // First attempt: raw as-is
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {}

  // Second attempt: escape literal control chars inside strings
  try {
    return JSON.parse(sanitizeJsonLiterals(raw)) as Record<string, unknown>;
  } catch {}

  // Third attempt: extract first {...} blob, then sanitize
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) {
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {}
    try {
      return JSON.parse(sanitizeJsonLiterals(m[0])) as Record<string, unknown>;
    } catch {}
  }

  return null;
}

type ParserState = "idle" | "in_thinking" | "in_tool";

const THINKING_OPEN = "<think>";
const THINKING_CLOSE = "</think>";
const TOOL_OPEN_PREFIX = "<tool_call";
const TOOL_CLOSE = "</tool_call>";

// StreamParser reads mixed model output and extracts text, thinking, and tool calls.
// Designed to be robust against Qwen Coder's output variations.
export class StreamParser {
  private buffer = "";
  private state: ParserState = "idle";
  private currentToolName: string | null = null;
  private callCounter = 0;

  constructor(private readonly onChunk: (chunk: ParsedChunk) => void) {}

  push(text: string): void {
    this.buffer += text
      .replace(/<thinking>/gi, THINKING_OPEN)
      .replace(/<\/thinking>/gi, THINKING_CLOSE);
    this.flush();
  }

  finish(): void {
    if (this.state === "idle" && this.buffer.trim().length > 0) {
      this.onChunk({ type: "text", content: this.buffer });
      this.buffer = "";
    } else if (this.state === "in_tool") {
      // Model stopped mid-tool-call — try to recover
      const raw = this.buffer.trim();
      if (raw && this.currentToolName) {
        const params = tryParseJson(raw);
        if (params !== null) {
          this.callCounter++;
          this.onChunk({
            type: "tool_call",
            call: {
              id: `tc_${this.callCounter}`,
              name: this.currentToolName as ToolName,
              parameters: params,
            },
          });
        } else {
          // Can't recover partial JSON — emit as text
          this.onChunk({ type: "text", content: this.buffer });
        }
      }
      this.buffer = "";
    }
  }

  private flush(): void {
    while (this.buffer.length > 0) {
      if (this.state === "idle") {
        const thinkIdx = this.buffer.indexOf(THINKING_OPEN);
        const toolIdx = this.buffer.indexOf(TOOL_OPEN_PREFIX);

        const next = Math.min(
          thinkIdx === -1 ? Infinity : thinkIdx,
          toolIdx === -1 ? Infinity : toolIdx,
        );

        if (next === Infinity) {
          const safe = this.safeIndex();
          if (safe > 0) {
            this.onChunk({ type: "text", content: this.buffer.slice(0, safe) });
            this.buffer = this.buffer.slice(safe);
          } else {
            break;
          }
        } else if (
          next === thinkIdx &&
          (toolIdx === -1 || thinkIdx <= toolIdx)
        ) {
          if (thinkIdx > 0) {
            this.onChunk({
              type: "text",
              content: this.buffer.slice(0, thinkIdx),
            });
          }
          this.buffer = this.buffer.slice(thinkIdx + THINKING_OPEN.length);
          this.state = "in_thinking";
        } else {
          // Tool call: find the closing > of the opening tag
          if (toolIdx > 0) {
            this.onChunk({
              type: "text",
              content: this.buffer.slice(0, toolIdx),
            });
          }
          const closeAngle = this.buffer.indexOf(">", toolIdx);
          if (closeAngle === -1) break; // wait for more data

          const openTag = this.buffer.slice(toolIdx, closeAngle + 1);
          // Match name="..." or name='...'
          const m = /name=["']([^"']+)["']/.exec(openTag);
          this.currentToolName = m ? (m[1] ?? null) : null;
          this.buffer = this.buffer.slice(closeAngle + 1);
          this.state = "in_tool";
        }
      } else if (this.state === "in_thinking") {
        const ci = this.buffer.indexOf(THINKING_CLOSE);
        if (ci === -1) break;
        const content = this.buffer.slice(0, ci).trim();
        if (content) {
          this.onChunk({ type: "thinking", content });
        }
        this.buffer = this.buffer.slice(ci + THINKING_CLOSE.length);
        this.state = "idle";
      } else {
        // in_tool
        const ci = this.buffer.indexOf(TOOL_CLOSE);
        if (ci === -1) break;

        const raw = this.buffer.slice(0, ci).trim();
        const params: Record<string, unknown> = (raw ? tryParseJson(raw) : null) ?? {};

        if (this.currentToolName) {
          this.callCounter++;
          this.onChunk({
            type: "tool_call",
            call: {
              id: `tc_${this.callCounter}`,
              name: this.currentToolName as ToolName,
              parameters: params,
            },
          });
        }

        this.buffer = this.buffer.slice(ci + TOOL_CLOSE.length);
        this.state = "idle";
        this.currentToolName = null;
      }
    }
  }

  private safeIndex(): number {
    const tags = [TOOL_OPEN_PREFIX, THINKING_OPEN, TOOL_CLOSE, THINKING_CLOSE];
    let safe = this.buffer.length;
    for (const tag of tags) {
      for (
        let len = Math.min(tag.length - 1, this.buffer.length);
        len > 0;
        len--
      ) {
        if (this.buffer.endsWith(tag.slice(0, len))) {
          safe = Math.min(safe, this.buffer.length - len);
          break;
        }
      }
    }
    return safe;
  }
}

export function parseFullText(text: string): ParsedChunk[] {
  const out: ParsedChunk[] = [];
  const p = new StreamParser((c) => out.push(c));
  p.push(text);
  p.finish();
  return out;
}

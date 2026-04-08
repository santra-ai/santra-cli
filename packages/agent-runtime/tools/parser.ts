import type { ToolCallRequest, ToolName } from "@santra/shared";

export type ParsedChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; call: ToolCallRequest };

type ParserState = "idle" | "in_thinking" | "in_tool";

const THINKING_OPEN = "<thinking>";
const THINKING_CLOSE = "</thinking>";
const TOOL_CLOSE = "</tool_call>";

export class StreamParser {
  private buffer = "";
  private state: ParserState = "idle";
  private currentToolName: string | null = null;
  private callCounter = 0;

  constructor(private readonly onChunk: (chunk: ParsedChunk) => void) {}

  push(text: string): void {
    this.buffer += text;
    this.flush();
  }

  finish(): void {
    if (this.state === "idle" && this.buffer.length > 0) {
      this.onChunk({ type: "text", content: this.buffer });
      this.buffer = "";
    }
  }

  private flush(): void {
    while (this.buffer.length > 0) {
      if (this.state === "idle") {
        const thinkIdx = this.buffer.indexOf(THINKING_OPEN);
        const toolIdx = this.buffer.indexOf("<tool_call ");
        const next = Math.min(
          thinkIdx === -1 ? Infinity : thinkIdx,
          toolIdx === -1 ? Infinity : toolIdx,
        );

        if (next === Infinity) {
          // No special tag coming — safe-flush up to where a tag couldn't start
          const safe = this.safeIndex();
          if (safe > 0) {
            this.onChunk({ type: "text", content: this.buffer.slice(0, safe) });
            this.buffer = this.buffer.slice(safe);
          } else {
            break;
          }
        } else if (next === thinkIdx) {
          if (thinkIdx > 0)
            this.onChunk({
              type: "text",
              content: this.buffer.slice(0, thinkIdx),
            });
          this.buffer = this.buffer.slice(thinkIdx + THINKING_OPEN.length);
          this.state = "in_thinking";
        } else {
          // Tool call — need the closing > of the opening tag
          if (toolIdx > 0)
            this.onChunk({
              type: "text",
              content: this.buffer.slice(0, toolIdx),
            });
          const closeAngle = this.buffer.indexOf(">", toolIdx);
          if (closeAngle === -1) break; // wait for more data
          const openTag = this.buffer.slice(toolIdx, closeAngle + 1);
          const m = /name="([^"]+)"/.exec(openTag);
          this.currentToolName = m ? m[1]! : null;
          this.buffer = this.buffer.slice(closeAngle + 1);
          this.state = "in_tool";
        }
      } else if (this.state === "in_thinking") {
        const ci = this.buffer.indexOf(THINKING_CLOSE);
        if (ci === -1) break;
        this.onChunk({ type: "thinking", content: this.buffer.slice(0, ci) });
        this.buffer = this.buffer.slice(ci + THINKING_CLOSE.length);
        this.state = "idle";
      } else {
        // in_tool
        const ci = this.buffer.indexOf(TOOL_CLOSE);
        if (ci === -1) break;
        const raw = this.buffer.slice(0, ci).trim();
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          /* skip */
        }
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

  // Don't flush the last N chars if they could be the start of a tag
  private safeIndex(): number {
    const tags = ["<tool_call", "<thinking", "</tool_call", "</thinking"];
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

// Parse a complete (non-streaming) string
export function parseFullText(text: string): ParsedChunk[] {
  const out: ParsedChunk[] = [];
  const p = new StreamParser((c) => out.push(c));
  p.push(text);
  p.finish();
  return out;
}

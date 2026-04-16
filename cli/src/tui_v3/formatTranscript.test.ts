import { describe, expect, test } from "bun:test";
import { flattenRowText, formatTranscriptRows } from "./formatTranscript";

import type { LogEntry } from "../tui/types";

describe("formatTranscriptRows", () => {
  test("renders a boxed reasoning block", () => {
    const items: LogEntry[] = [
      {
        id: "thinking-1",
        time: "09:00:01",
        level: "think",
        message: "Inspecting the terminal layout before composing the prototype.",
        finished: true,
      },
    ];

    const rows = formatTranscriptRows(items, 72);
    const textRows = rows.map(flattenRowText);

    expect(textRows.some((row) => row.includes("╭"))).toBe(true);
    expect(textRows.some((row) => row.includes("│ Inspecting the terminal layout"))).toBe(true);
    expect(textRows.some((row) => row.includes("╰"))).toBe(true);
  });

  test("renders tool rows differently when active versus completed", () => {
    const activeRows = formatTranscriptRows(
      [
        {
          id: "tool-1",
          time: "09:00:01",
          level: "bullet",
          message: "Inspect Codebuff layout",
          done: false,
        },
      ],
      72,
    );
    const doneRows = formatTranscriptRows(
      [
        {
          id: "tool-1",
          time: "09:00:01",
          level: "bullet",
          message: "Inspect Codebuff layout",
          detail: "Sticky transcript and bottom composer.",
          done: true,
        },
      ],
      72,
    );

    expect(activeRows[0]?.indicator?.kind).toBe("spinner");
    expect(doneRows[0]?.indicator).toMatchObject({ kind: "icon", text: "•" });
    expect(doneRows.map(flattenRowText).some((row) => row.includes("↳ Sticky transcript"))).toBe(true);
  });

  test("renders final responses with bullets and inline code styling", () => {
    const rows = formatTranscriptRows(
      [
        {
          id: "response-1",
          time: "09:00:05",
          level: "response",
          message:
            "# Prototype Ready\n\n- Sticky composer\nUse `Enter` to replay.",
        },
      ],
      72,
    );

    expect(rows.map(flattenRowText).some((row) => row.includes("• Sticky composer"))).toBe(true);
    expect(
      rows.some((row) =>
        row.after.some((segment) => segment.text === "Enter" && segment.tone === "code"),
      ),
    ).toBe(true);
  });

  test("renders diff blocks with line markers", () => {
    const rows = formatTranscriptRows(
      [
        {
          id: "diff-1",
          time: "09:00:10",
          level: "diff",
          message: "src/app.ts",
          diff: {
            file: "src/app.ts",
            added: 2,
            removed: 1,
            lines: [
              { type: "context", lineNo: -1, content: "12,4 12,5" },
              { type: "remove", lineNo: 12, content: "old line" },
              { type: "add", lineNo: 12, content: "new line" },
            ],
          },
        },
      ],
      72,
    );

    const textRows = rows.map(flattenRowText);
    expect(textRows.some((row) => row.includes("src/app.ts"))).toBe(true);
    expect(textRows.some((row) => row.includes("12 - old line"))).toBe(true);
    expect(textRows.some((row) => row.includes("12 + new line"))).toBe(true);
  });
});

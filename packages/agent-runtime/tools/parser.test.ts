import { describe, expect, test } from "bun:test";
import { parseFullText } from "./parser.ts";

describe("StreamParser markup recovery", () => {
  test("parses malformed status closing tags", () => {
    const chunks = parseFullText(
      "<status>Reading the README</<status><next>Now checking package.json</next>",
    );

    expect(chunks).toEqual([
      { type: "status", content: "Reading the README" },
      { type: "next", content: "Now checking package.json" },
    ]);
  });

  test("recovers next when a new tag opens before close", () => {
    const chunks = parseFullText(
      "<next>Tracing the runtime<status>Reading parser.ts</status>",
    );

    expect(chunks).toEqual([
      { type: "next", content: "Tracing the runtime" },
      { type: "status", content: "Reading parser.ts" },
    ]);
  });

  test("recovers status when tool call starts before close", () => {
    const chunks = parseFullText(
      '<status>Reading the runtime<tool_call name="read_file">{"path":"README.md"}</tool_call>',
    );

    expect(chunks).toEqual([
      { type: "status", content: "Reading the runtime" },
      {
        type: "tool_call",
        call: {
          id: "tc_1",
          name: "read_file",
          parameters: { path: "README.md" },
        },
      },
    ]);
  });
});

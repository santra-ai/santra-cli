import { describe, expect, test } from "bun:test";
import {
  parseTerminalMouseActions,
  sanitizeComposerInput,
} from "./input";

describe("sanitizeComposerInput", () => {
  test("drops sgr mouse packets before they reach the composer", () => {
    expect(sanitizeComposerInput("<65;111;18M<64;112;20M")).toBe("");
  });

  test("preserves printable prompt text", () => {
    expect(sanitizeComposerInput("Build the landing page shell")).toBe(
      "Build the landing page shell",
    );
  });

  test("drops escape and control characters", () => {
    expect(sanitizeComposerInput("\u001b[<65;111;18M")).toBe("");
    expect(sanitizeComposerInput("\u0008")).toBe("");
  });
});

describe("parseTerminalMouseActions", () => {
  test("detects sgr mouse wheel packets", () => {
    expect(parseTerminalMouseActions("\u001b[<64;52;18M\u001b[<65;52;18M")).toEqual([
      "scroll-up",
      "scroll-down",
    ]);
  });

  test("detects non-wheel mouse packets without treating them as text", () => {
    expect(parseTerminalMouseActions("\u001b[<0;52;18M")).toEqual(["mouse"]);
  });

  test("detects legacy x10 mouse wheel packets", () => {
    expect(parseTerminalMouseActions("\u001b[M`!!\u001b[Ma!!")).toEqual([
      "scroll-up",
      "scroll-down",
    ]);
  });
});

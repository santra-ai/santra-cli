import { describe, expect, test } from "bun:test";
import { classifyPrompt } from "./classifier.ts";

describe("classifyPrompt", () => {
  // ── simple_chat ────────────────────────────────────────────────────────
  describe("simple_chat", () => {
    test('"hi" → simple_chat', () => {
      expect(classifyPrompt("hi")).toBe("simple_chat");
    });

    test('"hello" → simple_chat', () => {
      expect(classifyPrompt("hello")).toBe("simple_chat");
    });

    test('"hey" → simple_chat', () => {
      expect(classifyPrompt("hey")).toBe("simple_chat");
    });

    test('"thanks" → simple_chat', () => {
      expect(classifyPrompt("thanks")).toBe("simple_chat");
    });

    test('"thank you" → simple_chat', () => {
      expect(classifyPrompt("thank you")).toBe("simple_chat");
    });

    test('"ok" → simple_chat', () => {
      expect(classifyPrompt("ok")).toBe("simple_chat");
    });

    test('"okay" → simple_chat', () => {
      expect(classifyPrompt("okay")).toBe("simple_chat");
    });

    test('"  Hello  " (whitespace) → simple_chat', () => {
      expect(classifyPrompt("  Hello  ")).toBe("simple_chat");
    });
  });

  // ── direct_answer ──────────────────────────────────────────────────────
  describe("direct_answer", () => {
    test('"what is a React hook?" → direct_answer', () => {
      expect(classifyPrompt("what is a React hook?")).toBe("direct_answer");
    });

    test('"how does async/await work?" → direct_answer', () => {
      expect(classifyPrompt("how does async/await work?")).toBe("direct_answer");
    });

    test('"write me an essay about the importance of testing" → direct_answer', () => {
      expect(classifyPrompt("write me an essay about the importance of testing")).toBe("direct_answer");
    });

    test('"write a poem about space" → direct_answer', () => {
      expect(classifyPrompt("write a poem about space")).toBe("direct_answer");
    });

    test('"write a short story about a developer" → direct_answer', () => {
      expect(classifyPrompt("write a short story about a developer")).toBe("direct_answer");
    });

    test('"explain how React hooks work" → direct_answer', () => {
      expect(classifyPrompt("explain how React hooks work")).toBe("direct_answer");
    });

    test('"what is typescript?" → direct_answer', () => {
      expect(classifyPrompt("what is typescript?")).toBe("direct_answer");
    });

    test('"why does this happen?" → direct_answer', () => {
      expect(classifyPrompt("why does this happen?")).toBe("direct_answer");
    });

    test('"summarize what REST APIs are" → direct_answer', () => {
      expect(classifyPrompt("summarize what REST APIs are")).toBe("direct_answer");
    });

    test('"tell me about monorepos" → direct_answer', () => {
      expect(classifyPrompt("tell me about monorepos")).toBe("direct_answer");
    });

    test('"tell me an essay on cow in 500 words" → direct_answer', () => {
      expect(classifyPrompt("tell me an essay on cow in 500 words")).toBe(
        "direct_answer",
      );
    });
  });

  // ── agent_task ─────────────────────────────────────────────────────────
  describe("agent_task — file extension refs", () => {
    test('"what does runner.ts do?" → agent_task', () => {
      expect(classifyPrompt("what does runner.ts do?")).toBe("agent_task");
    });

    test('"add error handling to client.ts" → agent_task', () => {
      expect(classifyPrompt("add error handling to client.ts")).toBe("agent_task");
    });

    test('"explain useAgent.ts" → agent_task', () => {
      expect(classifyPrompt("explain useAgent.ts")).toBe("agent_task");
    });
  });

  describe("agent_task — hard agent verbs", () => {
    test('"fix the bug in useAgent" → agent_task', () => {
      expect(classifyPrompt("fix the bug in useAgent")).toBe("agent_task");
    });

    test('"debug the login flow" → agent_task', () => {
      expect(classifyPrompt("debug the login flow")).toBe("agent_task");
    });

    test('"refactor the swarm pipeline" → agent_task', () => {
      expect(classifyPrompt("refactor the swarm pipeline")).toBe("agent_task");
    });

    test('"implement retry logic" → agent_task', () => {
      expect(classifyPrompt("implement retry logic")).toBe("agent_task");
    });

    test('"delete the old migration file" → agent_task', () => {
      expect(classifyPrompt("delete the old migration file")).toBe("agent_task");
    });

    test('"update the config" → agent_task', () => {
      expect(classifyPrompt("update the config")).toBe("agent_task");
    });
  });

  describe("agent_task — codebase context", () => {
    test('"explain this codebase" → agent_task', () => {
      expect(classifyPrompt("explain this codebase")).toBe("agent_task");
    });

    test('"how does this project work?" → agent_task', () => {
      expect(classifyPrompt("how does this project work?")).toBe("agent_task");
    });

    test('"walk me through this repo" → agent_task', () => {
      expect(classifyPrompt("walk me through this repo")).toBe("agent_task");
    });

    test('"read the whole codebase and explain it to me" → agent_task', () => {
      expect(
        classifyPrompt("read the whole codebase and explain it to me"),
      ).toBe("agent_task");
    });

    test('"update my README with relevant repository data" → agent_task', () => {
      expect(
        classifyPrompt("update my README with relevant repository data"),
      ).toBe("agent_task");
    });

    test('"create a README for this repo" → agent_task', () => {
      expect(classifyPrompt("create a README for this repo")).toBe(
        "agent_task",
      );
    });

    test('"write docs for the repository" → agent_task', () => {
      expect(classifyPrompt("write docs for the repository")).toBe(
        "agent_task",
      );
    });

    test('"update my README" → agent_task', () => {
      expect(classifyPrompt("update my README")).toBe("agent_task");
    });

    test('"rewrite the README for this project" → agent_task', () => {
      expect(classifyPrompt("rewrite the README for this project")).toBe(
        "agent_task",
      );
    });

    test('"create documentation for my project" → agent_task', () => {
      expect(classifyPrompt("create documentation for my project")).toBe(
        "agent_task",
      );
    });
  });

  describe("agent_task — construction verb + code object", () => {
    test('"create a new React component" → agent_task', () => {
      expect(classifyPrompt("create a new React component")).toBe("agent_task");
    });

    test('"write a function to sort an array" → agent_task', () => {
      expect(classifyPrompt("write a function to sort an array")).toBe("agent_task");
    });

    test('"build a new module for auth" → agent_task', () => {
      expect(classifyPrompt("build a new module for auth")).toBe("agent_task");
    });

    test('"add a test for the login flow" → agent_task', () => {
      expect(classifyPrompt("add a test for the login flow")).toBe("agent_task");
    });

    test('"generate a migration for users table" → agent_task', () => {
      expect(classifyPrompt("generate a migration for users table")).toBe("agent_task");
    });

    test('"make a new service for payments" → agent_task', () => {
      expect(classifyPrompt("make a new service for payments")).toBe("agent_task");
    });

    test('"write a hook for fetching data" → agent_task', () => {
      expect(classifyPrompt("write a hook for fetching data")).toBe("agent_task");
    });
  });

  describe("agent_task — edge cases", () => {
    test('"" (empty) → agent_task', () => {
      expect(classifyPrompt("")).toBe("agent_task");
    });

    test('"   " (whitespace only) → agent_task', () => {
      expect(classifyPrompt("   ")).toBe("agent_task");
    });
  });
});

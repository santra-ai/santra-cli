import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeToolCall } from "./local-runner.ts";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe("local-runner tool fallbacks", () => {
  test("glob accepts the glob parameter alias", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santra-tools-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "example.ts"), "export const value = 1;\n");
    process.chdir(dir);

    const result = await executeToolCall({
      id: "test-glob",
      name: "glob",
      parameters: {
        glob: "src/**/*.ts",
      },
    });

    expect(result.error).toBeUndefined();
    const parsed = JSON.parse(result.output) as { count: number; files: string[] };
    expect(parsed.count).toBe(1);
    expect(parsed.files).toEqual(["src/example.ts"]);
  });

  test("search_text returns matches without throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "santra-search-"));
    await mkdir(join(dir, "pkg"), { recursive: true });
    await writeFile(
      join(dir, "pkg", "sample.ts"),
      "export const entryPoint = 'main';\nconsole.log(entryPoint);\n",
    );
    process.chdir(dir);

    const result = await executeToolCall({
      id: "test-search",
      name: "search_text",
      parameters: {
        query: "entryPoint",
        cwd: ".",
        glob: "**/*.ts",
      },
    });

    expect(result.error).toBeUndefined();
    const parsed = JSON.parse(result.output) as {
      count: number;
      matches: Array<{ file: string; line: number; text: string }>;
      engine?: string;
    };
    expect(parsed.count).toBeGreaterThan(0);
    expect(parsed.matches[0]?.file.endsWith("pkg/sample.ts")).toBe(true);
    expect(parsed.matches.some((match) => match.text.includes("entryPoint"))).toBe(true);
    expect(["rg", "fallback"]).toContain(parsed.engine ?? "fallback");
  });
});

import type { ToolCallRequest, ToolCallResult } from "@santra/shared";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

// ─── Handlers
async function handleReadFile(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  if (!path) throw new Error("read_file: 'path' is required");
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) throw new Error(`read_file: not found: ${path}`);
  const content = await readFile(abs, "utf-8");
  return JSON.stringify({ path, content, lines: content.split("\n").length });
}

async function handleWriteFile(p: Record<string, unknown>): Promise<string> {
  const path = p["path"] as string;
  const content = p["content"] as string;
  if (!path) throw new Error("write_file: 'path' is required");
  if (content === undefined)
    throw new Error("write_file: 'content' is required");
  const abs = resolve(process.cwd(), path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf-8");
  return JSON.stringify({
    path,
    message: `Wrote ${content.length} chars to ${path}`,
  });
}

async function handleListDirectory(
  p: Record<string, unknown>,
): Promise<string> {
  const path = (p["path"] as string) ?? ".";
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) throw new Error(`list_directory: not found: ${path}`);
  const entries = await readdir(abs, { withFileTypes: true });
  const result = entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? "directory" : "file",
    path: join(path, e.name),
  }));
  return JSON.stringify({ path, entries: result });
}

async function handleSearchFiles(p: Record<string, unknown>): Promise<string> {
  const pattern = p["pattern"] as string;
  const cwd = (p["cwd"] as string) ?? ".";
  if (!pattern) throw new Error("search_files: 'pattern' is required");
  const absCwd = resolve(process.cwd(), cwd);
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: absCwd, onlyFiles: true })) {
    files.push(f);
  }
  return JSON.stringify({ pattern, cwd, files, count: files.length });
}

// ─── Dispatcher

export async function executeToolCall(
  call: ToolCallRequest,
): Promise<ToolCallResult> {
  try {
    let output: string;
    switch (call.name) {
      case "read_file":
        output = await handleReadFile(call.parameters);
        break;
      case "write_file":
        output = await handleWriteFile(call.parameters);
        break;
      case "list_directory":
        output = await handleListDirectory(call.parameters);
        break;
      case "search_files":
        output = await handleSearchFiles(call.parameters);
        break;
      default:
        throw new Error(`Unknown tool: ${call.name}`);
    }
    return { id: call.id, name: call.name, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      id: call.id,
      name: call.name,
      output: JSON.stringify({ error }),
      error,
    };
  }
}

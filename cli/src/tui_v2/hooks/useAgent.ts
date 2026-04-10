import { use, useCallback, useEffect, useState } from "react";
import type {
  AgentStats,
  FileEntry,
  LogEntry,
  ShellState,
  Task,
} from "../types";

function timeStamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
function makeId(): string {
  return Math.random().toString(36).substring(2, 8);
}

export default function useAgent() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", label: "Read codebase structure", status: "pending" },
    { id: "2", label: "Identify auth bug", status: "pending" },
    { id: "3", label: "Patch middleware", status: "pending" },
    { id: "4", label: "Write tests", status: "pending" },
    { id: "5", label: "Run test suite", status: "pending" },
    { id: "6", label: "Commit changes", status: "pending" },
  ]);

  const [files, setFiles] = useState<FileEntry[]>([
    { name: "src/", path: "src", status: "none", type: "dir", depth: 0 },
    {
      name: "middleware/",
      path: "src/middleware",
      status: "none",
      type: "dir",
      depth: 1,
    },
    {
      name: "auth.ts",
      path: "src/middleware/auth.ts",
      status: "none",
      type: "file",
      depth: 2,
    },
    {
      name: "cors.ts",
      path: "src/middleware/cors.ts",
      status: "none",
      type: "file",
      depth: 2,
    },
    {
      name: "routes/",
      path: "src/routes",
      status: "none",
      type: "dir",
      depth: 1,
    },
    {
      name: "package.json",
      path: "package.json",
      status: "none",
      type: "file",
      depth: 0,
    },
  ]);

  const [log, setLog] = useState<LogEntry[]>([]);

  const [stats, setStats] = useState<AgentStats>({
    model: "qwen/qwq-32b",
    tokens: 0,
    steps: 0,
    totalSteps: 12,
    elapsed: 0,
  });

  const [shell, setShell] = useState<ShellState>({ command: "", output: [] });

  const [done, setDone] = useState(false);

  //   ---- Helpers ----

  const pushLog = useCallback((entry: Omit<LogEntry, "id" | "time">) => {
    setLog((prev) => [...prev, { ...entry, id: makeId(), time: timeStamp() }]);
  }, []);

  const setTaskStatus = useCallback((id: string, status: Task["status"]) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status } : task)),
    );
  }, []);

  const markFile = useCallback((path: string, status: FileEntry["status"]) => {
    setFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, status } : file)),
    );
  }, []);

  const tick = useCallback((tokens: number, step: number) => {
    setStats((prev) => ({
      ...prev,
      tokens: prev.tokens + tokens,
      steps: prev.steps + step,
    }));
  }, []);

  useEffect(() => {
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    async function run() {
      // Step 1 — read structure
      setTaskStatus("1", "active");
      pushLog({
        level: "info",
        message: "Task: fix JWT token refresh bug in auth middleware",
      });
      await delay(800);
      pushLog({
        level: "tool",
        message: 'read_file("src/middleware/auth.ts")',
      });
      markFile("src/middleware/auth.ts", "read");
      await delay(600);
      pushLog({ level: "ok", message: "read  247 lines, 6.2kb" });
      tick(420, 1);
      setTaskStatus("1", "done");

      // Step 2 — identify bug
      await delay(500);
      setTaskStatus("2", "active");
      pushLog({ level: "tool", message: 'grep("refreshToken", "src/")' });
      await delay(700);
      pushLog({ level: "ok", message: "3 matches in 2 files" });
      tick(210, 2);

      await delay(400);
      pushLog({
        level: "think",
        message:
          "The token expiry check on line 84 uses Date.now() but the JWT payload stores expiry as Unix seconds, not ms. Comparison always passes. Need to multiply exp by 1000.",
      });
      await delay(900);
      setTaskStatus("2", "done");
      tick(380, 3);

      // Step 3 — patch
      await delay(400);
      setTaskStatus("3", "active");
      pushLog({
        level: "diff",
        message: 'edit_file("src/middleware/auth.ts", line 84)',
        diff: {
          file: "src/middleware/auth.ts",
          added: 1,
          removed: 1,
          lines: [
            {
              type: "context",
              lineNo: 83,
              content: "const payload = jwt.verify(token, SECRET);",
            },
            {
              type: "remove",
              lineNo: 84,
              content: "if (payload.exp < Date.now()) {",
            },
            {
              type: "add",
              lineNo: 84,
              content: "if (payload.exp * 1000 < Date.now()) {",
            },
            {
              type: "context",
              lineNo: 85,
              content: "  throw new AuthError('token expired');",
            },
          ],
        },
      });
      markFile("src/middleware/auth.ts", "modified");
      await delay(800);
      pushLog({ level: "ok", message: "patch applied" });
      tick(290, 4);
      setTaskStatus("3", "done");

      // Step 4 — write tests
      await delay(500);
      setTaskStatus("4", "active");
      pushLog({ level: "tool", message: 'create_file("src/auth.test.ts")' });
      setFiles((prev) => [
        ...prev,
        {
          name: "auth.test.ts",
          path: "src/auth.test.ts",
          status: "new",
          type: "file",
          depth: 1,
        },
      ]);
      await delay(1000);
      pushLog({ level: "ok", message: "wrote 48 lines" });
      tick(510, 5);
      setTaskStatus("4", "done");

      // Step 5 — run tests
      await delay(400);
      setTaskStatus("5", "active");
      const cmd = "bun test src/auth.test.ts";
      setShell({ command: cmd, output: [] });
      await delay(600);
      pushLog({ level: "tool", message: `exec("${cmd}")` });
      await delay(700);
      setShell({
        command: cmd,
        output: [
          { text: "✓ validates token correctly  (12ms)", type: "success" },
          { text: "✓ rejects expired tokens     (8ms)", type: "success" },
          { text: "✓ handles refresh flow       (21ms)", type: "success" },
        ],
      });
      await delay(500);
      // pushLog({ level: "ok", message: "3 tests passed" }); // shell output already shows this
      tick(180, 6);
      setTaskStatus("5", "done");

      // Step 6 — commit
      await delay(400);
      setTaskStatus("6", "active");
      const commitCmd = 'git commit -am "fix: JWT expiry comparison (ms vs s)"';
      setShell({
        command: commitCmd,
        output: [
          {
            text: "[main a3f92c1] fix: JWT expiry comparison (ms vs s)",
            type: "success",
          },
        ],
      });
      pushLog({ level: "tool", message: `exec("${commitCmd}")` });
      await delay(700);
      // pushLog({ level: "ok", message: "committed" }); // shell output already shows this
      tick(90, 7);
      setTaskStatus("6", "done");

      // pushLog({ level: "info", message: "All tasks complete." });
      setDone(true);
    }
    run();
  }, []);

  //   Elapsed timer
  useEffect(() => {
    if (done) return;

    const id = setInterval(() => {
      setStats((prev) => ({ ...prev, elapsed: prev.elapsed + 1 }));
    }, 1000);

    return () => clearInterval(id);
  }, [done]);

  return { tasks, files, log, stats, shell, done };
}

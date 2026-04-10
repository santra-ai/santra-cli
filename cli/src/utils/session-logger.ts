import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Session logger — writes detailed logs to .santra-logs/ in the project root.
// Only active when SANTRA_DEV=1 or NODE_ENV=development.
// Logs every user message, agent output, tool call, and tool result.
// This is the source of truth for debugging — the TUI intentionally shows minimal output.

const isDev =
  process.env["SANTRA_DEV"] === "1" ||
  process.env["NODE_ENV"] === "development";

// Write logs to the project repo root (where bun tui is run from)
const LOG_DIR = path.join(process.cwd(), ".santra-logs");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogPath(chatId: string): string {
  // Sanitize chatId for use as a filename
  const safe = chatId.replace(/[:/\\]/g, "-");
  return path.join(LOG_DIR, `${safe}.log`);
}

function timestamp(): string {
  return new Date().toISOString();
}

class SessionLogger {
  private handles: Map<string, fs.WriteStream> = new Map();

  private getStream(chatId: string): fs.WriteStream | null {
    if (!isDev) return null;
    ensureLogDir();

    if (!this.handles.has(chatId)) {
      const stream = fs.createWriteStream(getLogPath(chatId), { flags: "a" });
      stream.write(`\n${"=".repeat(60)}\n`);
      stream.write(`SESSION: ${chatId}\n`);
      stream.write(`STARTED: ${timestamp()}\n`);
      stream.write(`CWD: ${process.cwd()}\n`);
      stream.write(`${"=".repeat(60)}\n\n`);
      this.handles.set(chatId, stream);
    }

    return this.handles.get(chatId) ?? null;
  }

  log(chatId: string, role: string, content: string): void {
    const stream = this.getStream(chatId);
    if (!stream) return;

    const separator = "-".repeat(40);
    const lines = [`[${timestamp()}] ${role}`, separator, content, ""].join(
      "\n",
    );

    stream.write(lines + "\n");
  }

  close(chatId: string): void {
    const stream = this.handles.get(chatId);
    if (stream) {
      stream.write(`\n[${timestamp()}] SESSION END\n`);
      stream.end();
      this.handles.delete(chatId);
    }
  }
}

export const sessionLogger = new SessionLogger();

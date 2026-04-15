import type { DiffEntry, DiffLine } from "../tui/types/index.ts";

type Edit = { type: "add" | "remove" | "equal"; line: string };

/**
 * Myers diff algorithm — computes the shortest edit script between two line arrays.
 * Returns a sequence of Edit records covering every line in both old and new.
 */
function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const N = oldLines.length;
  const M = newLines.length;

  if (N === 0 && M === 0) return [];
  if (N === 0) return newLines.map((line) => ({ type: "add" as const, line }));
  if (M === 0) return oldLines.map((line) => ({ type: "remove" as const, line }));

  const max = N + M;
  const offset = max;
  const v: number[] = new Array(2 * max + 2).fill(0);
  const trace: number[][] = [];

  // Forward pass: find the length of the shortest edit path
  outer: for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const ki = k + offset;
      let x: number;
      if (k === -d || (k !== d && v[ki - 1]! < v[ki + 1]!)) {
        x = v[ki + 1]!; // move down (insert from new)
      } else {
        x = v[ki - 1]! + 1; // move right (delete from old)
      }
      let y = x - k;
      // Follow diagonal (equal lines)
      while (x < N && y < M && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[ki] = x;
      if (x >= N && y >= M) break outer;
    }
  }

  // Backtrack to reconstruct the edit sequence
  const edits: Edit[] = [];
  let x = N;
  let y = M;

  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const prevV = trace[d]!;
    const k = x - y;
    const ki = k + offset;

    let prevK: number;
    if (k === -d || (k !== d && prevV[ki - 1]! < prevV[ki + 1]!)) {
      prevK = k + 1; // came from insert
    } else {
      prevK = k - 1; // came from delete
    }
    const prevX = prevV[prevK + offset]!;
    const prevY = prevX - prevK;

    // Diagonal steps (equal lines)
    while (x > prevX && y > prevY) {
      edits.unshift({ type: "equal", line: oldLines[x - 1]! });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        edits.unshift({ type: "add", line: newLines[y - 1]! });
        y--;
      } else {
        edits.unshift({ type: "remove", line: oldLines[x - 1]! });
        x--;
      }
    }
  }

  return edits;
}

/**
 * Build a DiffEntry with proper Myers line diff, trimmed to show only
 * `contextLines` lines around each change. Collapsed sections are replaced
 * with a sentinel line (lineNo: -1) showing the count of hidden lines.
 */
export function buildDiff(
  filePath: string,
  oldStr: string,
  newStr: string,
  contextLines = 3,
): DiffEntry {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const edits = myersDiff(oldLines, newLines);

  // Assign line numbers and build the full flat list
  type AnnotatedLine = DiffLine & { oldIdx: number; newIdx: number };
  const flat: AnnotatedLine[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;
  let added = 0;
  let removed = 0;

  for (const edit of edits) {
    if (edit.type === "equal") {
      flat.push({ type: "context", content: edit.line, lineNo: oldLineNo, oldIdx: oldLineNo, newIdx: newLineNo });
      oldLineNo++;
      newLineNo++;
    } else if (edit.type === "remove") {
      flat.push({ type: "remove", content: edit.line, lineNo: oldLineNo, oldIdx: oldLineNo, newIdx: -1 });
      oldLineNo++;
      removed++;
    } else {
      flat.push({ type: "add", content: edit.line, lineNo: newLineNo, oldIdx: -1, newIdx: newLineNo });
      newLineNo++;
      added++;
    }
  }

  // Find which indices are "near" a change (within contextLines distance)
  const isChange = flat.map((l) => l.type !== "context");
  const nearChange = flat.map((_, i) => {
    for (let d = -contextLines; d <= contextLines; d++) {
      const j = i + d;
      if (j >= 0 && j < flat.length && isChange[j]) return true;
    }
    return false;
  });

  // Build trimmed output, collapsing distant context lines
  const result: DiffLine[] = [];
  let skipStart = -1;

  for (let i = 0; i < flat.length; i++) {
    const line = flat[i]!;
    if (line.type === "context" && !nearChange[i]) {
      if (skipStart === -1) skipStart = i;
      continue;
    }
    if (skipStart !== -1) {
      const skipped = i - skipStart;
      result.push({ type: "context", content: `... ${skipped} unchanged line${skipped !== 1 ? "s" : ""} ...`, lineNo: -1 });
      skipStart = -1;
    }
    result.push({ type: line.type, content: line.content, lineNo: line.lineNo });
  }

  // Handle trailing skipped context
  if (skipStart !== -1) {
    const skipped = flat.length - skipStart;
    result.push({ type: "context", content: `... ${skipped} unchanged line${skipped !== 1 ? "s" : ""} ...`, lineNo: -1 });
  }

  return { file: filePath, added, removed, lines: result };
}

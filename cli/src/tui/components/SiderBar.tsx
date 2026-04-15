import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FileEntry, Task } from "../types";

// ─── Task List ───────────────────────────────────────────────────────────────

interface TaskIconProps {
  status: Task["status"];
}

function TaskIcon({ status }: TaskIconProps) {
  if (status === "done") return <Text color="green">✓</Text>;
  if (status === "error") return <Text color="red">✗</Text>;
  if (status === "active")
    return (
      <Text color="green">
        <Spinner type="dots" />
      </Text>
    );
  return <Text color="gray">○</Text>;
}

function taskColor(status: Task["status"]): string {
  if (status === "done") return "green";
  if (status === "active") return "white";
  if (status === "error") return "red";
  return "gray";
}

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={0}>
        <Text color="gray" >
          {"TASKS".padEnd(20)}
        </Text>
      </Box>

      {tasks.map((task) => (
        <Box key={task.id} paddingX={1} gap={1}>
          <TaskIcon status={task.status} />
          <Text color={taskColor(task.status)} wrap="truncate">
            {task.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── File Tree ───────────────────────────────────────────────────────────────

function fileColor(status: FileEntry["status"]): string {
  if (status === "modified") return "yellow";
  if (status === "new") return "green";
  if (status === "read") return "cyan";
  return "gray";
}

type TreeRow = {
  key: string;
  name: string;
  depth: number;
  isDir: boolean;
  status: FileEntry["status"];
  implicit: boolean; // true = inferred parent dir, not explicitly listed
};

/** Build a sorted, tree-structured row list from flat file entries. */
function buildTreeRows(files: FileEntry[]): TreeRow[] {
  // Only keep files (skip explicitly-listed dirs with no status — they add noise)
  const fileEntries = files.filter((f) => f.type === "file");

  // Sort by path so sibling dirs are grouped
  const sorted = [...fileEntries].sort((a, b) => a.path.localeCompare(b.path));

  const shownDirs = new Set<string>();
  const rows: TreeRow[] = [];

  for (const entry of sorted) {
    // Add implicit directory nodes for each ancestor
    const parts = entry.path.replace(/\\/g, "/").split("/");
    const segments = parts.slice(0, -1); // all but filename
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!shownDirs.has(dirPath)) {
        shownDirs.add(dirPath);
        rows.push({
          key: dirPath,
          name: seg,
          depth: i,
          isDir: true,
          status: "none",
          implicit: true,
        });
      }
    }

    rows.push({
      key: entry.path,
      name: entry.name,
      depth: parts.length - 1,
      isDir: false,
      status: entry.status,
      implicit: false,
    });
  }

  return rows;
}

interface FileTreeProps {
  files: FileEntry[];
}

export function FileTree({ files }: FileTreeProps) {
  const rows = buildTreeRows(files);

  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginTop={1}>
        <Text color="gray">{"FILES".padEnd(20)}</Text>
      </Box>

      {rows.map((row) => (
        <Box
          key={row.key}
          paddingLeft={1 + row.depth * 2}
          gap={1}
        >
          {row.isDir
            ? <Text color="gray">▸ {row.name}/</Text>
            : <>
                <Text color={row.status === "modified" ? "yellow" : row.status === "new" ? "green" : "gray"}>
                  {row.status === "modified" ? "●" : row.status === "new" ? "+" : " "}
                </Text>
                <Text color={fileColor(row.status)} wrap="truncate">{row.name}</Text>
              </>
          }
        </Box>
      ))}
    </Box>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  width: number;
  tasks: Task[];
  files: FileEntry[];
}

export function Sidebar({ width, tasks, files }: SidebarProps) {
  return (
    <Box
      width={width}
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingY={0}
    >
      <TaskList tasks={tasks} />
      <Box
        borderStyle="classic"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        marginTop={1}
      />
      <FileTree files={files} />
    </Box>
  );
}

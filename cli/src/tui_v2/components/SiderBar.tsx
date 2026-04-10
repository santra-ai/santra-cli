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
        <Text color="gray" dimColor>
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

function filePrefix(entry: FileEntry): string {
  if (entry.status === "modified") return "●";
  if (entry.status === "new") return "+";
  if (entry.type === "dir") return "▸";
  return " ";
}

interface FileTreeProps {
  files: FileEntry[];
}

export function FileTree({ files }: FileTreeProps) {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>
          {"FILES".padEnd(20)}
        </Text>
      </Box>

      {files.map((entry) => (
        <Box
          key={entry.path}
          paddingX={1}
          paddingLeft={1 + entry.depth * 2}
          gap={1}
        >
          <Text color={fileColor(entry.status)}>{filePrefix(entry)}</Text>
          <Text color={fileColor(entry.status)} wrap="truncate">
            {entry.name}
          </Text>
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

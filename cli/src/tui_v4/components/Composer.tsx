import path from "node:path";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { SlashCommand } from "../input.ts";
import type { AgentStats } from "../types.ts";
import type { PendingApproval, PendingQuestion } from "../hooks/useAgent.ts";
import type { DiffLine } from "../types.ts";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function shortModel(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1] ?? model;
  return name.replace(/-(instruct|chat|preview|latest)$/i, "");
}

function renderDiffPreview(lines: DiffLine[], limit = 6): DiffLine[] {
  const changed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.type !== "context") {
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
        changed.add(j);
      }
    }
  }

  const preview: DiffLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (changed.has(i)) preview.push(lines[i]!);
    if (preview.length >= limit) break;
  }
  return preview;
}

function DiffPreview({ pendingApproval }: { pendingApproval: PendingApproval }) {
  const lines = renderDiffPreview(pendingApproval.diff.lines);
  const overflow = pendingApproval.diff.lines.length - lines.length;
  const addedColor = "#7abf9a";
  const removedColor = "#d48a8a";
  const accentColor = "#7fb4ff";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={accentColor}>
        Changes <Text color={addedColor}>+{pendingApproval.diff.added}</Text>
        <Text color={accentColor}> </Text>
        <Text color={removedColor}>-{pendingApproval.diff.removed}</Text>
      </Text>
      {lines.length === 0 ? (
        <Text color="#8fb7c9">
          No line-level diff preview available.
        </Text>
      ) : (
        lines.map((line, index) => (
          <Text key={`${pendingApproval.callId}-diff-${index}`}>
            <Text
              color={
                line.type === "add"
                  ? addedColor
                  : line.type === "remove"
                    ? removedColor
                    : "#8fb7c9"
              }
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </Text>
            <Text color="#8fb7c9"> </Text>
            <Text
              color={
                line.type === "add"
                  ? addedColor
                  : line.type === "remove"
                    ? removedColor
                    : "white"
              }
            >
              {line.content}
            </Text>
          </Text>
        ))
      )}
      {overflow > 0 ? (
        <Text color="#8fb7c9">
          … {overflow} more lines
        </Text>
      ) : null}
    </Box>
  );
}

interface ComposerProps {
  value: string;
  busy: boolean;
  placeholder: string;
  suggestions: SlashCommand[];
  selectedSuggestionIdx: number;
  stats: AgentStats;
  width?: number;
  pendingApproval?: PendingApproval | null;
  pendingQuestion?: PendingQuestion | null;
  approvalFeedbackMode?: boolean;
}

function ApprovalOverlay({
  pendingApproval,
  value,
  feedbackMode,
}: {
  pendingApproval: PendingApproval;
  value: string;
  feedbackMode: boolean;
}) {
  const fileName = path.basename(pendingApproval.filePath);

  return (
    <Box flexDirection="column" marginX={1} marginBottom={1}>
      <Text color="#7fb4ff" bold>
        Waiting for approval to edit {fileName}
      </Text>
      <Text color="white">{pendingApproval.filePath}</Text>
      <DiffPreview pendingApproval={pendingApproval} />
      <Text color="#8fb7c9">
        (y) allow  ·  (a) allow all  ·  (r) reject  ·  (f) feedback
      </Text>
      {feedbackMode || value.trim() ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="#7fb4ff" bold={feedbackMode}>
            Feedback
          </Text>
          {value.trim() ? (
            <Text color="white">{value}</Text>
          ) : (
            <Text color="#8fb7c9">
              Type your guidance and press Enter.
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
}

function QuestionOverlay({
  pendingQuestion,
  value,
}: {
  pendingQuestion: PendingQuestion;
  value: string;
}) {
  return (
    <Box flexDirection="column" marginX={1} marginBottom={1}>
      <Text color="#7fb4ff" bold>
        Waiting for user input
      </Text>
      {pendingQuestion.header ? (
        <Text color="#8fb7c9">{pendingQuestion.header}</Text>
      ) : null}
      <Text color="white">{pendingQuestion.prompt}</Text>
      {pendingQuestion.options.length > 0 ? (
        <Text color="#8fb7c9">
          {pendingQuestion.options.map((option) => option.label).join("  ·  ")}
        </Text>
      ) : null}
      <Text color="#8fb7c9">
        Type your answer and press Enter.
      </Text>
      {value.trim() ? <Text color="white">{value}</Text> : null}
    </Box>
  );
}

function SuggestionsOverlay({
  suggestions,
  selectedSuggestionIdx,
}: Pick<ComposerProps, "suggestions" | "selectedSuggestionIdx">) {
  return (
    <Box
      flexDirection="column"
      marginX={1}
      marginBottom={1}
      borderStyle="round"
      borderColor="gray"
    >
      {suggestions.map((suggestion, index) => {
        const selected = index === selectedSuggestionIdx;
        const prefix = selected ? "› " : "  ";

        return (
          <Box key={`${suggestion.kind}-${suggestion.name}-${index}`} paddingX={1}>
            <Text color={selected ? "cyan" : "gray"} bold={selected}>
              {prefix}
              {suggestion.name}
            </Text>
            <Text color="gray" dimColor>
              {"  "}
              {suggestion.description}
            </Text>
          </Box>
        );
      })}
      <Box paddingX={2}>
        <Text color="gray" dimColor>
          ↑↓ choose  •  tab complete  •  enter run
        </Text>
      </Box>
    </Box>
  );
}

export function Composer({
  value,
  busy,
  placeholder,
  suggestions,
  selectedSuggestionIdx,
  stats,
  width,
  pendingApproval,
  pendingQuestion,
  approvalFeedbackMode,
}: ComposerProps) {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (busy) {
      setCursorVisible(false);
      return;
    }

    const timer = setInterval(() => {
      setCursorVisible((current) => !current);
    }, 450);

    return () => clearInterval(timer);
  }, [busy]);

  const cursor = busy ? "" : cursorVisible ? "▌" : " ";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
      width={width}
    >
      {!pendingApproval && !pendingQuestion && suggestions.length > 0 ? (
        <SuggestionsOverlay
          suggestions={suggestions}
          selectedSuggestionIdx={selectedSuggestionIdx}
        />
      ) : null}

      {pendingApproval ? (
        <ApprovalOverlay
          pendingApproval={pendingApproval}
          value={value}
          feedbackMode={Boolean(approvalFeedbackMode)}
        />
      ) : null}

      {pendingQuestion ? (
        <QuestionOverlay pendingQuestion={pendingQuestion} value={value} />
      ) : null}

      <Box paddingX={1}>
        <Text
          color={pendingApproval || pendingQuestion ? "white" : busy ? "cyan" : "#7CFFB2"}
          bold
        >
          {pendingApproval || pendingQuestion ? "│" : busy ? "◈" : "◆"}
        </Text>
        <Text> </Text>
        {pendingApproval ? (
          value ? (
            <Text color="white">
              {value}
              {cursor}
            </Text>
          ) : (
            <Text color="#8fb7c9">
              Waiting for your input. Press (y), (a), (r), or (f).
              {cursor}
            </Text>
          )
        ) : pendingQuestion ? (
          value ? (
            <Text color="white">
              {value}
              {cursor}
            </Text>
          ) : (
            <Text color="#8fb7c9">
              Waiting for your answer.
              {cursor}
            </Text>
          )
        ) : busy ? (
          <Text color="gray" dimColor>
            Running…  Esc to stop
          </Text>
        ) : value ? (
          <Text color="white">
            {value}
            {cursor}
          </Text>
        ) : (
          <Text color="gray" dimColor>
            {placeholder}
            {cursor}
          </Text>
        )}
      </Box>

      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="gray"
        paddingX={1}
      >
        <Text color="#7CFFB2">● </Text>
        <Text color="gray">{shortModel(stats.model)}</Text>
        <Text color="gray">  ·  </Text>
        <Text color="white">{stats.tokens.toLocaleString()}</Text>
        <Text color="gray"> tokens</Text>
        <Text color="gray">  ·  </Text>
        <Text color="white">{stats.toolCalls}</Text>
        <Text color="gray"> tools</Text>
        <Text color="gray">  ·  </Text>
        <Text color="white">{stats.steps}</Text>
        <Text color="gray">
          /{stats.totalSteps} steps
        </Text>
        <Text color="gray">  ·  </Text>
        <Text color="white">{formatElapsed(stats.elapsed)}</Text>
      </Box>
    </Box>
  );
}

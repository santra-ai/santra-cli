import path from "node:path";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import type { SlashCommand } from "../input.ts";
import type { AgentStats } from "../types.ts";
import type { PendingApproval, PendingQuestion } from "../hooks/useAgent.ts";
import type { DiffLine } from "../types.ts";

// Santra brand colors
const ORANGE = "#F97316";
const ORANGE_LIGHT = "#fdba74";  // light orange for headings/decorations
const ORANGE_DIM = "#a34d0e";
const MUTED = "#555555";
const SUBTLE = "#3a3a3a";
const GREEN_DIM = "#4a8a6a";
const RED_DIM = "#8a4a4a";

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
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={MUTED}>
        diff{"  "}
        <Text color={GREEN_DIM}>+{pendingApproval.diff.added}</Text>
        {"  "}
        <Text color={RED_DIM}>-{pendingApproval.diff.removed}</Text>
      </Text>
      {lines.length === 0 ? (
        <Text color={MUTED}>no preview available</Text>
      ) : (
        lines.map((line, index) => (
          <Text key={`${pendingApproval.callId}-diff-${index}`}>
            <Text
              color={
                line.type === "add"
                  ? GREEN_DIM
                  : line.type === "remove"
                    ? RED_DIM
                    : SUBTLE
              }
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </Text>
            <Text color={MUTED}> </Text>
            <Text
              color={
                line.type === "add"
                  ? GREEN_DIM
                  : line.type === "remove"
                    ? RED_DIM
                    : "#888888"
              }
            >
              {line.content}
            </Text>
          </Text>
        ))
      )}
      {overflow > 0 ? (
        <Text color={MUTED}>… {overflow} more</Text>
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
      <Text color={ORANGE} bold>
        approval required  <Text color="white" bold={false}>{fileName}</Text>
      </Text>
      <Text color={MUTED}>{pendingApproval.filePath}</Text>
      <DiffPreview pendingApproval={pendingApproval} />
      <Text color={MUTED}>
        y allow  ·  a allow all  ·  r reject  ·  f feedback
      </Text>
      {feedbackMode || value.trim() ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={ORANGE_DIM}>feedback</Text>
          {value.trim() ? (
            <Text color="white">{value}</Text>
          ) : (
            <Text color={MUTED}>type guidance and press Enter</Text>
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
      <Text color={ORANGE} bold>input needed</Text>
      {pendingQuestion.header ? (
        <Text color={MUTED}>{pendingQuestion.header}</Text>
      ) : null}
      <Text color="white">{pendingQuestion.prompt}</Text>
      {pendingQuestion.options.length > 0 ? (
        <Text color={MUTED}>
          {pendingQuestion.options.map((option) => option.label).join("  ·  ")}
        </Text>
      ) : null}
      <Text color={MUTED}>type your answer and press Enter</Text>
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
      borderStyle="single"
      borderColor={SUBTLE}
    >
      {suggestions.map((suggestion, index) => {
        const selected = index === selectedSuggestionIdx;
        const prefix = selected ? "▸ " : "  ";

        return (
          <Box key={`${suggestion.kind}-${suggestion.name}-${index}`} paddingX={1}>
            <Text color={selected ? ORANGE : MUTED} bold={selected}>
              {prefix}
              {suggestion.name}
            </Text>
            <Text color={SUBTLE}>
              {"  "}
              {suggestion.description}
            </Text>
          </Box>
        );
      })}
      <Box paddingX={2}>
        <Text color={SUBTLE}>
          ↑↓ navigate  ·  tab complete  ·  enter run
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

  // Prompt indicator: orange when active, dim when waiting/busy
  const promptColor = pendingApproval || pendingQuestion
    ? MUTED
    : busy
      ? ORANGE_DIM
      : ORANGE;
  const promptSymbol = busy ? "◈" : "›";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={SUBTLE}
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
        <Text color={promptColor} bold>{promptSymbol}</Text>
        <Text> </Text>
        {pendingApproval ? (
          value ? (
            <Text color="white">{value}{cursor}</Text>
          ) : (
            <Text color={MUTED}>press y · a · r · f{cursor}</Text>
          )
        ) : pendingQuestion ? (
          value ? (
            <Text color="white">{value}{cursor}</Text>
          ) : (
            <Text color={MUTED}>type your answer{cursor}</Text>
          )
        ) : busy ? (
          <Text color={MUTED}>running  ·  Esc to stop</Text>
        ) : value ? (
          <Text color="white">{value}{cursor}</Text>
        ) : (
          <Text color={MUTED}>{placeholder}{cursor}</Text>
        )}
      </Box>

      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={SUBTLE}
        paddingX={1}
      >
        <Text color={ORANGE_LIGHT}>◆ </Text>
        <Text color={MUTED}>{shortModel(stats.model)}</Text>
        <Text color={SUBTLE}>  ·  </Text>
        <Text color="#888888">{stats.tokens.toLocaleString()}</Text>
        <Text color={SUBTLE}> tok</Text>
        <Text color={SUBTLE}>  ·  </Text>
        <Text color="#888888">{stats.toolCalls}</Text>
        <Text color={SUBTLE}> tools</Text>
        <Text color={SUBTLE}>  ·  </Text>
        <Text color="#888888">{stats.steps}/{stats.totalSteps}</Text>
        <Text color={SUBTLE}> steps</Text>
        <Text color={SUBTLE}>  ·  </Text>
        <Text color="#888888">{formatElapsed(stats.elapsed)}</Text>
      </Box>
    </Box>
  );
}

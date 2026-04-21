# @santra/core

The decision and routing layer of the Santra CLI. This package owns two responsibilities:

1. **Classify** incoming prompts to determine whether they need agent/tool access or can be answered directly.
2. **Route** each request to the right runtime — a `Swarm` (multi-agent) or a single `BaseAgent` — and normalise the result into a consistent `RunState`.

The `core` package deliberately contains no UI logic, no tool implementations, and no prompt engineering for coding tasks. Those live in `packages/agent-runtime/` and `agents/` respectively. Core is the thin routing layer between the TUI (or any other consumer) and the agent runtimes.

---

## Package structure

```
core/
├── index.ts              # Public exports: Runner, RunnerOptions, RunOptions, RunState
├── src/
│   ├── runner.ts         # Runner class — main entry point
│   ├── classifier.ts     # classifyPrompt() — zero-latency prompt classifier
│   └── types.ts          # RunnerOptions, RunOptions, re-exported RunState / SwarmState
├── session/              # Session persistence helpers
└── tools/                # Any core-level tool utilities (separate from agent-runtime tools)
```

---

## Runner

`Runner` is the single class that the CLI (and any other consumer) instantiates. It holds two runtimes:

- `BaseAgent` — a single-agent run, used for direct answers and simple chat.
- `Swarm` — the multi-agent orchestrator, used for all coding tasks by default.

```ts
import { Runner } from "@santra/core";

const runner = new Runner({
  endpoint: "https://api.anthropic.com/...",
  useSwarm: true, // optional — defaults to true
});

const state = await runner.run({
  prompt: "Add input validation to the /api/users route",
  previousMessages: [...],
  onPhase: (phase) => console.log(phase),
  onFileChangeReview: async (callId, path, old, next) => {
    // show diff to user, return { decision: "keep" | "revert" | "feedback", message? }
    return { decision: "keep" };
  },
  onUserQuestion: async (questions) => {
    // present question to user, return their answer string
    return "yes";
  },
  abortSignal: controller.signal,
});

// state.output — { type: "text", content: string } | { type: "error", message: string }
// state.messages — full conversation history (user + assistant turns)
// state.toolCalls — array of all tool calls made during the run
// state.thinking — array of <think> reasoning steps captured during streaming
```

### Routing logic

```
runner.run(prompt)
       │
       ├─ classifyPrompt(prompt)
       │         │
       │         ├─ "simple_chat"    ─▶  BaseAgent (SIMPLE_CHAT_PROMPT, no tools)
       │         ├─ "direct_answer"  ─▶  BaseAgent (DIRECT_ANSWER_PROMPT, no tools)
       │         └─ "agent_task"     ─▶  Swarm (orchestrator + specialists)
       │
       └─ shouldUseSwarm() override
                 │
                 └─ if useSwarm=true (default) → always Swarm regardless of classification
```

In practice, `useSwarm` defaults to `true`, which means the `Swarm` runtime handles all requests. The classification result is still computed so it can inform system-prompt selection when swarm mode is disabled (e.g. in tests or programmatic usage).

### Error recovery

When a `Swarm` run fails mid-way, `Runner` does not surface a raw error. Instead it constructs a **continuation message** that summarises:

- The original prompt
- The last three `<status>` phases emitted by agents
- The last six tool-call results (name + outcome)
- The error message itself

This continuation message is appended as an `assistant` turn in the returned message history, giving subsequent runs full context to resume cleanly.

---

## Classifier

`classifyPrompt(prompt: string): PromptClassification`

A pure, synchronous function with zero latency and no LLM calls. It categorises each prompt into one of three buckets:

| Classification   | Meaning | Runtime used |
|-----------------|---------|-------------|
| `simple_chat`   | Social greeting or acknowledgement (≤4 words, ≤30 chars) | `BaseAgent` with casual chat system prompt |
| `direct_answer` | Knowledge question answerable without file access | `BaseAgent` with structured-answer system prompt |
| `agent_task`    | Requires file reads, edits, or tool use | `Swarm` |

### Classification rules (in priority order)

The classifier errs towards `agent_task` — false negatives (sending a direct question through the swarm) are safe; false positives (sending a coding task through direct answer) would silently fail.

**`simple_chat` conditions** — all must be true:
- Prompt length < 30 characters
- Word count ≤ 4
- No code characters (`/`, `{`, `(`, or a file extension)
- Matches a social-greeting regex: `hi`, `hello`, `thanks`, `ok`, etc.

**`agent_task` signals** — any one triggers routing to the agent pipeline:

| Signal | Examples |
|--------|---------|
| File extension reference | `auth.ts`, `package.json`, `.env` |
| Codebase-context phrase | `this project`, `the codebase`, `our implementation` |
| Whole-repo reading request | `explain the entire codebase`, `walk me through the full repo` |
| Repo-scoped documentation | `update the README in this repository` |
| Local workspace artifact | `my Dockerfile`, `this config` |
| Hard agent verb | `fix`, `debug`, `refactor`, `edit`, `update`, `delete`, `rename`, `implement` |
| Soft verb + code noun | `create a component`, `write a function`, `build a middleware` |

**`direct_answer`** — the fallback for prompts < 300 characters that passed all agent-task checks. Covers essays, poems, explanations, factual questions, and general coding concepts.

Very long prompts (≥ 300 chars) that didn't match any agent-task signal default to `agent_task` as a safety net.

### Testing the classifier

```ts
import { classifyPrompt } from "@santra/core/src/classifier";

classifyPrompt("hi")                          // → "simple_chat"
classifyPrompt("What is a closure?")          // → "direct_answer"
classifyPrompt("Fix the bug in auth.ts")      // → "agent_task"
classifyPrompt("Add a retry function")        // → "agent_task"  (soft verb + code noun)
classifyPrompt("Explain this codebase")       // → "agent_task"  (codebase-context phrase)
```

Unit tests live at `core/src/classifier.test.ts`.

---

## Types

```ts
// Instantiation options for Runner
type RunnerOptions = {
  endpoint: string;   // API endpoint URL passed to BaseAgent and Swarm
  useSwarm?: boolean; // Default: true
};

// Per-run options passed to runner.run()
type RunOptions = {
  prompt: string;
  previousMessages?: Message[];          // Conversation history to prepend
  onDelta?: (chunk: string) => void;     // Streaming text chunk callback
  onPhase?: (phase: AgentPhase) => void; // Lifecycle phase callback (status, think, tool, etc.)
  useSwarm?: boolean;                    // Per-run override of the instance default
  abortSignal?: AbortSignal;             // Cancel in-flight requests
  onFileChangeReview?: (              // Called before each file write
    callId: string,
    filePath: string,
    oldStr: string,
    newStr: string,
  ) => Promise<FileChangeFeedback>;
  onUserQuestion?: (                  // Called when an agent uses ask_user
    questions: UserQuestion[],
  ) => Promise<string>;
};

// Normalised result from runner.run()
type RunState = {
  messages: Message[];         // Full conversation history after this run
  output: RunOutput;           // { type: "text", content } | { type: "error", message }
  toolCalls: ToolCallResult[]; // All tool calls made during the run
  thinking: ThinkingStep[];    // <think> reasoning steps captured from streaming
};
```

---

## AgentPhase events

The `onPhase` callback receives structured events throughout a run. These drive the TUI's live transcript view:

| phase.type    | When emitted | Payload |
|--------------|-------------|---------|
| `status`     | Agent writes a `<status>` tag | `{ message: string }` |
| `thinking`   | Agent writes a `<think>` block | `{ content: string }` |
| `narrative`  | Agent writes a `<next>` block | `{ content: string }` |
| `tool_call`  | Agent requests a tool | `{ name, input }` |
| `tool_result`| Tool returns a result | `{ callId, name, output, error? }` |
| `delta`      | Streaming text chunk | `{ content: string }` |
| `completed`  | Run finished | `{ output: string }` |
| `agent_spawned` | Sub-agent started | `{ agentId, name }` |
| `error`      | Run failed | `{ message: string }` |

---

## System prompts

When routing to `BaseAgent` (non-swarm mode), `Runner` selects one of two lightweight system prompts:

**`DIRECT_ANSWER_PROMPT`** — used for `direct_answer` classification:
- Instructs the model to write structured plain text
- Use markdown headings for multi-section answers
- Do not use tools, do not mention internal process

**`SIMPLE_CHAT_PROMPT`** — used for `simple_chat` classification:
- Reply naturally and briefly
- Do not propose edits, plans, or repository exploration

For `agent_task` in non-swarm mode, no system prompt override is applied — the agent runtime's own orchestrator prompt is used.

---

## Relationship to other packages

```
@santra/core
    │
    ├── depends on @santra/agent-runtime
    │       ├── BaseAgent        (single-agent SSE streaming runtime)
    │       ├── Swarm            (multi-agent orchestration layer)
    │       └── executeToolCall  (local tool execution)
    │
    └── depends on @santra/shared
            ├── Message, RunState, AgentPhase types
            ├── tool definitions (getToolDefinition, AVAILABLE_TOOLS)
            └── model constants (AVAILABLE_MODELS, AvailableModelId)
```

Consumers of `@santra/core` (the TUI, tests, future API server) only need to import `Runner` and interact through `RunOptions` / `RunState`. The agent internals, SSE parsing, and tool execution are fully encapsulated in `agent-runtime`.

---

## Adding a new routing mode

To add a new classification bucket or override routing logic:

1. Add the new classification string to `PromptClassification` in `classifier.ts`.
2. Add detection rules in `classifyPrompt()` — follow the existing pattern of testing the most specific signals first.
3. Handle the new classification in `Runner.run()` — select the appropriate runtime and system prompt.
4. Add test cases to `classifier.test.ts`.

Keep the classifier fast and dependency-free. It must remain a pure, synchronous function.

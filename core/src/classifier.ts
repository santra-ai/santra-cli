/**
 * Lightweight, synchronous prompt classifier.
 * Determines whether a prompt requires full agent orchestration or can be
 * handled directly — with zero latency and no LLM calls.
 *
 * The classifier errs towards `agent_task` (false negatives are safe;
 * false positives would silently break real coding tasks).
 */

export type PromptClassification = "simple_chat" | "direct_answer" | "agent_task";

/** Greetings and social acknowledgements that never need the planner. */
const SIMPLE_CHAT_RE =
  /^(hi|hello|hey|thanks|thank you|bye|goodbye|ok|okay|yes|no|sure|cool|great|yep|nope)\b/i;

/** File-extension fragments that signal a coding context (for simple_chat gate only). */
const CODE_CHAR_RE = /[/{(]|\.[a-z]{1,4}$/i;

/** File extension references anywhere in the message. */
const FILE_EXT_RE = /\.[a-z]{1,4}\b/i;

/**
 * Verbs that ALWAYS indicate a repo/code operation (reading, modifying, or
 * debugging existing code). These always route to agent_task.
 */
const HARD_AGENT_VERB_RE =
  /\b(fix|debug|refactor|edit|update|delete|remove|rename|move|migrate|patch|rewrite|implement)\b/i;

/**
 * "Soft" construction verbs — they route to agent_task ONLY when paired with
 * a code-object noun below. Alone (e.g. "write an essay") they are fine as
 * direct answers.
 */
const SOFT_CONSTRUCTION_VERB_RE =
  /\b(create|write|build|add|generate|make)\b/i;

/**
 * Code-object nouns. When combined with a soft construction verb, the request
 * is clearly asking to produce a code artifact → agent_task.
 */
const CODE_OBJECT_RE =
  /\b(component|function|hook|class|method|module|test|spec|service|controller|route|endpoint|middleware|schema|model|migration|interface|type|enum)\b/i;

/**
 * Phrases that imply awareness of the current repo/codebase. These always
 * need agent context.
 */
const CODEBASE_CONTEXT_RE =
  /\b(this (codebase|project|repo|code|implementation)|the (code|implementation|codebase))\b/i;

/**
 * Broader whole-repository reading/explaining requests that should still use
 * the agent path even without "this repo" style wording.
 */
const WHOLE_CODEBASE_RE =
  /\b(read|scan|analyze|explain|walk me through)\b[\s\S]{0,80}\b(whole|entire|full)\s+(codebase|repo|repository|project)\b|\b(whole|entire|full)\s+(codebase|repo|repository|project)\b[\s\S]{0,80}\b(read|scan|analyze|explain|walk me through)\b/i;

/**
 * Documentation requests that are explicitly about the current repository or
 * its files should route through the agent so it can inspect the repo first.
 */
const REPO_DOC_RE =
  /\b(readme|documentation|docs)\b/i;

const REPO_REFERENCE_RE =
  /\b(repo|repository|project|codebase)\b/i;

/**
 * Local-workspace language. Requests framed around "my", "this", "here", or
 * the current workspace should bias toward agent execution over generic chat.
 */
const LOCAL_CONTEXT_RE =
  /\b(my|this|current|here|our)\b/i;

/**
 * Common repository artifacts that usually live in the workspace and should
 * be inspected rather than guessed about.
 */
const WORKSPACE_ARTIFACT_RE =
  /\b(readme|documentation|docs|config|package\.json|tsconfig|dockerfile|license|changelog)\b/i;

/**
 * Classify a prompt into one of three buckets:
 *
 * - `simple_chat`   — greeting / social acknowledgement; no planner, no tools.
 * - `direct_answer` — request that can be answered from LLM knowledge alone
 *                     (explanation, essay, poem, factual Q&A, etc.).
 * - `agent_task`    — requires file/tool access; swarm + planner allowed.
 */
export function classifyPrompt(prompt: string): PromptClassification {
  const trimmed = prompt.trim();

  // Empty input falls through to agent_task for safety
  if (!trimmed) return "agent_task";

  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/);

  // ── simple_chat ──────────────────────────────────────────────────────────
  // Short (< 30 chars, ≤ 4 words), no code characters, matches social set.
  if (
    trimmed.length < 30 &&
    words.length <= 4 &&
    !CODE_CHAR_RE.test(trimmed) &&
    SIMPLE_CHAT_RE.test(lower)
  ) {
    return "simple_chat";
  }

  // ── agent_task signals ───────────────────────────────────────────────────
  // Check all signals that unconditionally route to the agent pipeline.

  // 1. Explicit file reference (e.g. "fix bug in auth.ts")
  if (FILE_EXT_RE.test(lower)) return "agent_task";

  // 2. Codebase-context phrase ("this project", "this codebase", etc.)
  if (CODEBASE_CONTEXT_RE.test(lower)) return "agent_task";

  // 2a. Broad whole-codebase reading/explaining requests still require repo access.
  if (WHOLE_CODEBASE_RE.test(lower)) return "agent_task";

  // 2b. Repo-aware documentation requests (e.g. "update my README with
  // relevant data of this repository") must inspect files before answering.
  if (REPO_DOC_RE.test(lower) && REPO_REFERENCE_RE.test(lower)) {
    return "agent_task";
  }

  // 2c. Local-workspace artifact requests should also route to the agent even
  // when the user does not explicitly say "repository".
  if (LOCAL_CONTEXT_RE.test(lower) && WORKSPACE_ARTIFACT_RE.test(lower)) {
    return "agent_task";
  }

  // 2d. Action-oriented documentation requests are typically about the current
  // repo in a coding assistant context, so prefer the agent path.
  if (SOFT_CONSTRUCTION_VERB_RE.test(lower) && REPO_DOC_RE.test(lower)) {
    return "agent_task";
  }

  // 3. Hard agent verbs — always need code context (fix, debug, refactor, etc.)
  if (HARD_AGENT_VERB_RE.test(lower)) return "agent_task";

  // 4. Soft construction verb + code object (e.g. "create a component", "write a function")
  if (SOFT_CONSTRUCTION_VERB_RE.test(lower) && CODE_OBJECT_RE.test(lower)) {
    return "agent_task";
  }

  // ── direct_answer ────────────────────────────────────────────────────────
  // Anything under 300 chars that passed all the agent_task checks above.
  // Covers: essays, poems, explanations, factual questions, creative writing,
  // general coding concepts, etc.
  if (trimmed.length < 300) return "direct_answer";

  // Very long prompts that didn't match a clear category → let the agent handle it
  return "agent_task";
}

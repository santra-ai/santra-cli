import type { ExecuteParams, RunState } from './types';

export type SendMessageInput = {
  content: string
  previousRunState?: RunState | null
}

export type SendMessageDeps = {
  execute: (params: ExecuteParams) => Promise<RunState>
}

export async function sendMessage(
  input: SendMessageInput,
  deps: SendMessageDeps,
): Promise<RunState> {
  const prompt = input.content.trim()

  if (!prompt) {
    throw new Error('Cannot send an empty message.')
  }

  return deps.execute({
    prompt,
    previousRun: input.previousRunState ?? undefined,
  })
}

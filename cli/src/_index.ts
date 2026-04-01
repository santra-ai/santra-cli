import { clientExecuter } from './client-executor'
import { sendMessage } from './send-message'

const runState = await sendMessage(
  { content: 'Explain this file' },
  {
    agent: 'base2',
    execute: clientExecuter,
  },
)

console.log(runState.output)

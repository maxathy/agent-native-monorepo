import type { AgentState } from './state.js';

export function shouldContinueActing(state: AgentState): 'act' | 'reflect' {
  if (!state.shouldContinue || state.stepCount >= state.maxSteps) {
    return 'reflect';
  }
  return 'act';
}

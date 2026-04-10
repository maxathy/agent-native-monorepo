import { getTracer } from '@repo/telemetry';
import type { RunResponse } from '@repo/agent-contracts';
import type { AgentState } from '../graph/state.js';

const tracer = getTracer('agent-service');

export async function egressNode(state: AgentState): Promise<Partial<AgentState>> {
  return tracer.startActiveSpan('agent.node.egress', async (span) => {
    try {
      span.setAttribute('run_id', state.runId);
      span.setAttribute('session_id', state.sessionId);

      const hasErrors = state.toolOutputs.some((t) => t.error);
      const outcome = hasErrors ? ('partial' as const) : ('success' as const);

      span.setAttribute('outcome', outcome);

      return { outcome };
    } finally {
      span.end();
    }
  });
}

export function buildRunResponse(state: AgentState): RunResponse {
  return {
    runId: state.runId,
    sessionId: state.sessionId,
    messages: state.messages,
    outcome: state.outcome ?? 'success',
    tokenCounts: state.tokenCounts,
    retrievedContext: state.retrievedContext,
  };
}

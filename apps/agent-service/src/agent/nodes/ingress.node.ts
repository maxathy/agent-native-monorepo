import { randomUUID } from 'node:crypto';
import { getTracer } from '@repo/telemetry';
import { RunRequestSchema } from '@repo/agent-contracts';
import { seedWorkingMemory } from '@repo/memory-core';
import type { AgentState } from '../graph/state.js';

const tracer = getTracer('agent-service');

export async function ingressNode(
  state: AgentState,
  rawBody: unknown,
  correlationId: string,
): Promise<Partial<AgentState>> {
  return tracer.startActiveSpan('agent.node.ingress', async (span) => {
    try {
      const request = RunRequestSchema.parse(rawBody);
      const runId = randomUUID();

      span.setAttribute('run_id', runId);
      span.setAttribute('session_id', request.sessionId);

      const workingMemory = seedWorkingMemory({
        runId,
        sessionId: request.sessionId,
        correlationId,
        messages: request.messages,
      });

      return {
        ...workingMemory,
        maxSteps: request.config?.maxSteps ?? 10,
        stepCount: 0,
        shouldContinue: true,
        toolOutputs: [],
      };
    } finally {
      span.end();
    }
  });
}

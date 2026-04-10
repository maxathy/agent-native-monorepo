import { getTracer } from '@repo/telemetry';
import type { AgentState } from '../graph/state.js';

const tracer = getTracer('agent-service');

export interface Tool {
  name: string;
  execute: (input: unknown) => Promise<unknown>;
}

export interface ActNodeDeps {
  tools: Tool[];
  selectTool: (plan: string, tools: Tool[]) => Promise<{ toolName: string; input: unknown } | null>;
}

export async function actNode(
  state: AgentState,
  deps: ActNodeDeps,
): Promise<Partial<AgentState>> {
  return tracer.startActiveSpan('agent.node.act', async (span) => {
    try {
      span.setAttribute('run_id', state.runId);
      span.setAttribute('session_id', state.sessionId);
      span.setAttribute('step_count', state.stepCount);

      if (!state.plan) {
        return {
          shouldContinue: false,
          stepCount: state.stepCount + 1,
        };
      }

      const selection = await deps.selectTool(state.plan, deps.tools);

      if (!selection) {
        // No tool needed — plan is complete
        return {
          shouldContinue: false,
          stepCount: state.stepCount + 1,
        };
      }

      const tool = deps.tools.find((t) => t.name === selection.toolName);
      if (!tool) {
        return {
          toolOutputs: [
            ...state.toolOutputs,
            {
              toolName: selection.toolName,
              input: selection.input,
              output: null,
              error: `Tool "${selection.toolName}" not found`,
            },
          ],
          shouldContinue: false,
          stepCount: state.stepCount + 1,
        };
      }

      try {
        const output = await tool.execute(selection.input);
        span.setAttribute('tool.name', selection.toolName);

        return {
          toolOutputs: [
            ...state.toolOutputs,
            {
              toolName: selection.toolName,
              input: selection.input,
              output,
            },
          ],
          stepCount: state.stepCount + 1,
          shouldContinue: state.stepCount + 1 < state.maxSteps,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          toolOutputs: [
            ...state.toolOutputs,
            {
              toolName: selection.toolName,
              input: selection.input,
              output: null,
              error: errorMessage,
            },
          ],
          stepCount: state.stepCount + 1,
          shouldContinue: false,
        };
      }
    } finally {
      span.end();
    }
  });
}

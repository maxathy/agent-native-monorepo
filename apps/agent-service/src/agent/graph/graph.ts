import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { AgentState } from './state.js';
import { shouldContinueActing } from './edges.js';
import { ingressNode } from '../nodes/ingress.node.js';
import { retrieveNode, type RetrieveNodeDeps } from '../nodes/retrieve.node.js';
import { planNode, type PlanNodeDeps } from '../nodes/plan.node.js';
import { actNode, type ActNodeDeps } from '../nodes/act.node.js';
import { distillNode, type DistillNodeDeps } from '../nodes/distill.node.js';
import { reflectNode, type ReflectNodeDeps } from '../nodes/reflect.node.js';
import { egressNode } from '../nodes/egress.node.js';
import { IO_RETRY } from './retry.js';

export interface GraphDeps {
  retrieve: RetrieveNodeDeps;
  plan: PlanNodeDeps;
  act: ActNodeDeps;
  distill: DistillNodeDeps;
  reflect: ReflectNodeDeps;
}

const AgentStateAnnotation = Annotation.Root({
  runId: Annotation<string>,
  sessionId: Annotation<string>,
  correlationId: Annotation<string>,
  messages: Annotation<AgentState['messages']>,
  retrievedContext: Annotation<AgentState['retrievedContext']>,
  currentPlan: Annotation<string | undefined>,
  toolOutputs: Annotation<AgentState['toolOutputs']>,
  tokenCounts: Annotation<AgentState['tokenCounts']>,
  outcome: Annotation<AgentState['outcome']>,
  stepCount: Annotation<number>,
  maxSteps: Annotation<number>,
  topK: Annotation<number>,
  hopDepth: Annotation<number>,
  shouldContinue: Annotation<boolean>,
  // Must be here as well as in AgentStateSchema. A key absent from the
  // annotation is dropped between nodes, and the failure mode is a `reflect`
  // that silently writes nothing.
  extraction: Annotation<AgentState['extraction']>,
});

export function buildAgentGraph(
  deps: GraphDeps,
  rawBody: unknown,
  correlationId: string,
  checkpointer?: BaseCheckpointSaver,
) {
  // IO_RETRY goes on every node that performs I/O and on none that does not.
  // `ingress` and `egress` are pure; retrying them would only repeat a Zod
  // parse. `distill` carries it too — it makes a model call, and having no
  // side effects makes it the safest node in the graph to re-run.
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('ingress', async (state) => {
      return ingressNode(state as AgentState, rawBody, correlationId);
    })
    .addNode(
      'retrieve',
      async (state) => {
        return retrieveNode(state as AgentState, deps.retrieve);
      },
      { retryPolicy: IO_RETRY },
    )
    .addNode(
      'plan',
      async (state) => {
        return planNode(state as AgentState, deps.plan);
      },
      { retryPolicy: IO_RETRY },
    )
    .addNode(
      'act',
      async (state) => {
        return actNode(state as AgentState, deps.act);
      },
      { retryPolicy: IO_RETRY },
    )
    .addNode(
      'distill',
      async (state) => {
        return distillNode(state as AgentState, deps.distill);
      },
      { retryPolicy: IO_RETRY },
    )
    .addNode(
      'reflect',
      async (state) => {
        return reflectNode(state as AgentState, deps.reflect);
      },
      { retryPolicy: IO_RETRY },
    )
    .addNode('egress', async (state) => {
      return egressNode(state as AgentState);
    })
    .addEdge(START, 'ingress')
    .addEdge('ingress', 'retrieve')
    .addEdge('retrieve', 'plan')
    .addEdge('plan', 'act')
    .addConditionalEdges('act', (state) => shouldContinueActing(state as AgentState), {
      act: 'act',
      distill: 'distill',
    })
    .addEdge('distill', 'reflect')
    .addEdge('reflect', 'egress')
    .addEdge('egress', END);

  return graph.compile(checkpointer ? { checkpointer } : undefined);
}

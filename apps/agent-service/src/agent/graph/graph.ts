import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import type { AgentState } from './state.js';
import { shouldContinueActing } from './edges.js';
import { ingressNode } from '../nodes/ingress.node.js';
import { retrieveNode, type RetrieveNodeDeps } from '../nodes/retrieve.node.js';
import { planNode, type PlanNodeDeps } from '../nodes/plan.node.js';
import { actNode, type ActNodeDeps } from '../nodes/act.node.js';
import { reflectNode, type ReflectNodeDeps } from '../nodes/reflect.node.js';
import { egressNode } from '../nodes/egress.node.js';

export interface GraphDeps {
  retrieve: RetrieveNodeDeps;
  plan: PlanNodeDeps;
  act: ActNodeDeps;
  reflect: ReflectNodeDeps;
}

const AgentStateAnnotation = Annotation.Root({
  runId: Annotation<string>,
  sessionId: Annotation<string>,
  correlationId: Annotation<string>,
  messages: Annotation<AgentState['messages']>,
  retrievedContext: Annotation<AgentState['retrievedContext']>,
  plan: Annotation<string | undefined>,
  toolOutputs: Annotation<AgentState['toolOutputs']>,
  tokenCounts: Annotation<AgentState['tokenCounts']>,
  outcome: Annotation<AgentState['outcome']>,
  stepCount: Annotation<number>,
  maxSteps: Annotation<number>,
  shouldContinue: Annotation<boolean>,
});

export function buildAgentGraph(deps: GraphDeps, rawBody: unknown, correlationId: string) {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('ingress', async (state) => {
      return ingressNode(state as AgentState, rawBody, correlationId);
    })
    .addNode('retrieve', async (state) => {
      return retrieveNode(state as AgentState, deps.retrieve);
    })
    .addNode('plan', async (state) => {
      return planNode(state as AgentState, deps.plan);
    })
    .addNode('act', async (state) => {
      return actNode(state as AgentState, deps.act);
    })
    .addNode('reflect', async (state) => {
      return reflectNode(state as AgentState, deps.reflect);
    })
    .addNode('egress', async (state) => {
      return egressNode(state as AgentState);
    })
    .addEdge(START, 'ingress')
    .addEdge('ingress', 'retrieve')
    .addEdge('retrieve', 'plan')
    .addEdge('plan', 'act')
    .addConditionalEdges('act', (state) => shouldContinueActing(state as AgentState), {
      act: 'act',
      reflect: 'reflect',
    })
    .addEdge('reflect', 'egress')
    .addEdge('egress', END);

  return graph.compile();
}

import { StateGraph, START, END } from './state-machine';
import { SemanticRouter } from './semantic-router';
import { Planner } from './planner';
import { ContextWindow } from './context-window';
import { MemoryInjector } from './memory-injector';
import { Dispatcher } from './dispatcher';
import { Synthesizer } from './synthesizer';
import type { AgentState, ExecutionStep, AgentError } from '@/shared/types';
import { AgentRegistry } from '@/agents/registry';
import { logger } from '@/shared/logger';

const MAX_RETRIES = 3;

interface AgentResult {
  stepId: string;
  output?: unknown;
  error?: AgentError;
  async?: boolean;
  fallbackUsed?: boolean;
}

export class Orchestrator {
  private graph: StateGraph<AgentState>;

  constructor(
    private router: SemanticRouter,
    private planner: Planner,
    private contextWindow: ContextWindow,
    private memory: MemoryInjector,
    private dispatcher: Dispatcher,
    private synthesizer: Synthesizer,
    private agents: AgentRegistry,
  ) {
    this.graph = this.buildGraph();
  }

  private buildGraph(): StateGraph<AgentState> {
    const graph = new StateGraph<AgentState>();

    graph.addNode('summarize_context', async (state) => {
      const optimized = await this.contextWindow.optimize(state);
      return {
        ...state,
        messages: optimized.messages,
        summary: optimized.summary,
      };
    });

    graph.addNode('classify_intent', async (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const intent = await this.router.classify(
        lastMessage?.content ?? '',
        state.summary,
      );
      return { ...state, intent };
    });

    graph.addNode('inject_memory', async (state) => {
      if (!state.intent) return state;
      const memory = await this.memory.retrieve(state.intent);
      return { ...state, memory };
    });

    graph.addNode('create_plan', async (state) => {
      if (!state.intent) return state;
      const plan = await this.planner.decompose(
        state.intent,
        state.memory,
        state.context,
      );
      return { ...state, plan, retryCount: 0 };
    });

    graph.addNode('dispatch_agents', async (state) => {
      let currentState = { ...state };

      if (state.plan.length === 0) {
        logger.debug({ conversationId: state.meta.conversationId }, 'Empty plan — skipping dispatch');
        return currentState;
      }

      const waves = this.topologicalWaves(currentState.plan);
      const allResults: AgentResult[] = [];

      for (const wave of waves) {
        const waveResults = await Promise.all(
          wave.map(async (step): Promise<AgentResult> => {
            let lastError: AgentError | null = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                if (attempt > 0) {
                  logger.warn(
                    { stepId: step.id, attempt, agent: step.agent, action: step.action },
                    'Retrying step execution',
                  );
                }

                if (step.async) {
                  const jobId = await this.dispatcher.dispatchAsync(
                    step.agent,
                    step,
                    currentState.context,
                  );
                  const output = await this.dispatcher.awaitResult(jobId);
                  return { stepId: step.id, output, async: false };
                }

                const agent = this.agents.get(step.agent);
                const output = await agent.execute(step, currentState.context);
                return { stepId: step.id, output, async: false };
              } catch (err) {
                lastError = {
                  stepId: step.id,
                  message: (err as Error).message,
                  code: 'EXECUTION_ERROR',
                  timestamp: Date.now(),
                };

                if (attempt < MAX_RETRIES) continue;

                if (step.fallbackAction) {
                  try {
                    logger.info(
                      { stepId: step.id, fallback: step.fallbackAction },
                      'Executing fallback action',
                    );
                    const fallbackAgent = this.agents.get(step.agent);
                    const output = await fallbackAgent.execute(
                      { ...step, action: step.fallbackAction },
                      currentState.context,
                    );
                    return { stepId: step.id, output, async: false, fallbackUsed: true };
                  } catch {
                    return { stepId: step.id, error: lastError };
                  }
                }

                return { stepId: step.id, error: lastError };
              }
            }

            return { stepId: step.id, error: lastError! };
          }),
        );

        allResults.push(...waveResults);

        currentState = {
          ...currentState,
          context: {
            ...currentState.context,
            agentResults: [
              ...((currentState.context['agentResults'] as AgentResult[]) ?? []),
              ...waveResults,
            ],
          },
          errors: [
            ...currentState.errors,
            ...waveResults
              .filter((r): r is AgentResult & { error: NonNullable<AgentResult['error']> } => r.error !== undefined)
              .map((r) => r.error!),
          ],
        };
      }

      return currentState;
    });

    graph.addNode('synthesize', async (state) => {
      const response = await this.synthesizer.summarize(state);
      return { ...state, messages: [...state.messages, response] };
    });

    graph.addConditionalEdges('dispatch_agents', () => 'synthesize');

    graph.addEdge(START, 'summarize_context');
    graph.addEdge('summarize_context', 'classify_intent');
    graph.addEdge('classify_intent', 'inject_memory');
    graph.addEdge('inject_memory', 'create_plan');
    graph.addEdge('create_plan', 'dispatch_agents');
    graph.addEdge('dispatch_agents', 'synthesize');
    graph.addEdge('synthesize', END);

    return graph.compile();
  }

  async run(
    input: string,
    userId: string,
    trigger: 'chat' | 'event' | 'cron' = 'chat',
  ): Promise<string> {
    const initialState: AgentState = {
      messages: [{ role: 'user', content: input }],
      intent: null,
      plan: [],
      context: {},
      memory: { episodic: [], semantic: [] },
      errors: [],
      retryCount: 0,
      meta: {
        conversationId: crypto.randomUUID(),
        userId,
        timestamp: Date.now(),
        trigger,
      },
    };

    logger.info(
      { conversationId: initialState.meta.conversationId, trigger, inputLength: input.length },
      'Orchestrator started',
    );

    const finalState = await this.graph.invoke(initialState);

    const lastMessage = finalState.messages[finalState.messages.length - 1];

    logger.info(
      {
        conversationId: finalState.meta.conversationId,
        errors: finalState.errors.length,
        steps: finalState.plan.length,
      },
      'Orchestrator completed',
    );

    return lastMessage?.content ?? 'No response generated.';
  }

  private topologicalWaves(steps: ExecutionStep[]): ExecutionStep[][] {
    const waves: ExecutionStep[][] = [];
    const remaining = new Set(steps.map((s) => s.id));

    while (remaining.size > 0) {
      const wave = steps.filter(
        (s) =>
          remaining.has(s.id) &&
          s.dependsOn.every((depId) => !remaining.has(depId)),
      );

      if (wave.length === 0) {
        logger.error('Circular dependency detected in plan — breaking');
        break;
      }

      wave.forEach((s) => remaining.delete(s.id));
      waves.push(wave);
    }

    return waves;
  }
}

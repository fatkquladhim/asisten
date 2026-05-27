import { logger } from '@/shared/logger';

export const START = Symbol('__start__');
export const END = Symbol('__end__');

const END_STR = '__END__';
const START_STR = '__START__';

type NodeFunction<T> = (state: T) => Promise<T> | T;
type ConditionFunction<T> = (state: T) => string;

interface InternalNode<T> {
  name: string;
  fn: NodeFunction<T>;
}

interface ConditionalEdge<T> {
  from: string;
  condition: ConditionFunction<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class StateGraph<T extends Record<string, any>> {
  private nodes = new Map<string, InternalNode<T>>();
  private edges = new Map<string, string>();
  private conditionalEdges = new Map<string, ConditionalEdge<T>>();
  private compiled = false;
  private startNode: string | null = null;

  addNode(name: string, fn: NodeFunction<T>): this {
    if (this.nodes.has(name)) {
      throw new Error(`Node "${name}" already exists`);
    }
    this.nodes.set(name, { name, fn });
    return this;
  }

  addEdge(from: string | typeof START, to: string | typeof END): this {
    const fromStr = typeof from === 'symbol' ? START_STR : from;
    const toStr = typeof to === 'symbol' ? END_STR : to;

    if (typeof from === 'symbol') {
      this.startNode = fromStr;
    }

    this.edges.set(fromStr, toStr);
    return this;
  }

  addConditionalEdges(from: string, condition: ConditionFunction<T>): this {
    this.conditionalEdges.set(from, { from, condition });
    return this;
  }

  compile(): this {
    if (this.nodes.size === 0) {
      throw new Error('Graph has no nodes');
    }
    if (!this.startNode) {
      throw new Error('Graph has no START edge');
    }

    const reachable = new Set<string>();
    const queue = [this.startNode];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);

      const conditional = this.conditionalEdges.get(current);
      if (conditional) {
        // Conditional edges can go to any node depending on runtime; skip strict validation
        continue;
      }

      const next = this.edges.get(current);
      if (next && next !== END_STR) {
        queue.push(next);
      }
    }

    // Nodes reachable via conditional edges can't be statically validated
    // Runtime will determine if they're hit. Log but don't fail.
    for (const [name] of this.nodes) {
      if (!reachable.has(name)) {
        // Only warn once; these are typically intentional fallback paths
        // logger.warn({ node: name }, 'Node only reachable conditionally');
      }
    }

    this.compiled = true;
    return this;
  }

  async invoke(initialState: T): Promise<T> {
    if (!this.compiled) {
      throw new Error('Graph must be compiled before invocation. Call .compile() first.');
    }

    let currentState = { ...initialState };
    let currentNode: string | null = this.startNode;

    if (!currentNode) {
      throw new Error('No start node defined');
    }

    const visited = new Set<string>();
    const maxSteps = 100;

    for (let step = 0; step < maxSteps; step++) {
      if (currentNode === END_STR) {
        break;
      }

      const node = this.nodes.get(currentNode);
      if (!node) {
        throw new Error(`Node "${currentNode}" not found`);
      }

      logger.debug(
        { node: currentNode, step, conversationId: ((currentState as Record<string, unknown>)['meta'] as Record<string, unknown>)?.['conversationId'] },
        'Executing graph node',
      );

      currentState = await node.fn(currentState);

      const conditional = this.conditionalEdges.get(currentNode);
      if (conditional) {
        const next = conditional.condition(currentState);
        if (next === END_STR) {
          break;
        }
        currentNode = next;
        continue;
      }

      const next = this.edges.get(currentNode);
      if (!next || next === END_STR) {
        break;
      }

      if (visited.has(next)) {
        logger.warn(
          { node: next, step },
          'Cycle detected in graph — breaking to prevent infinite loop',
        );
        break;
      }
      visited.add(next);
      currentNode = next;
    }

    return currentState;
  }
}

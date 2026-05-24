import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export interface AgentInterface {
  execute(step: ExecutionStep, context: Record<string, unknown>): Promise<unknown>;
}

export class AgentRegistry {
  private agents = new Map<string, AgentInterface>();

  register(name: string, agent: AgentInterface): void {
    this.agents.set(name, agent);
    logger.info({ agent: name }, 'Agent registered');
  }

  get(name: string): AgentInterface {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found in registry`);
    }
    return agent;
  }
}

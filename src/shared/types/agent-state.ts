export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ParsedIntent {
  domain: string;
  action: string;
  entities: string[];
}

export interface ExecutionStep {
  id: string;
  agent: 'quant' | 'erp' | 'cyber' | 'lifestyle';
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  async: boolean;
  fallbackAction?: string;
}

export interface AgentError {
  stepId: string;
  message: string;
  code: string;
  timestamp: number;
}

export interface AgentState {
  messages: ChatMessage[];
  summary?: string;
  intent: ParsedIntent | null;
  plan: ExecutionStep[];
  context: Record<string, unknown>;
  memory: {
    episodic: unknown[];
    semantic: unknown[];
  };
  errors: AgentError[];
  retryCount: number;
  meta: {
    conversationId: string;
    userId: string;
    timestamp: number;
    trigger: 'chat' | 'event' | 'cron';
  };
}

/**
 * @file Type definitions for Agent Manager service
 * @module services/agent-manager/types
 */

import type { ClaudeCodeOptions } from '../claude-code/types.js';
import type { AgentState } from '../../types/session-states.js';

export type AgentType = 'claude';
export type AgentSessionStatus = AgentState;

export interface AgentSession {
  readonly id: string;
  readonly type: AgentType;
  readonly serviceSessionId: string;
  status: AgentState;
  readonly projectPath: string;
  readonly taskId?: string;
  readonly mcpSessionId?: string;
  readonly created_at: string;
  last_activity: string;
  readonly output_buffer: string[];
  readonly error_buffer: string[];
}

export interface AgentCommand {
  command: string;
  timeout?: number;
}

export interface AgentCommandResult {
  success: boolean;
  output?: string;
  error?: string | AgentError;
  duration: number;
}

export interface AgentError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ClaudeSessionConfig {
  project_path: string;
  task_id?: string;
  mcp_session_id?: string;
  mode?: 'interactive' | 'batch' | 'review';
  environment_variables?: Record<string, string>;
  initial_context?: string;
  options?: ClaudeCodeOptions;
}


export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  busySessions: number;
  errorSessions: number;
  sessionsByType: Record<AgentType, number>;
}

export interface SessionEvent {
  sessionId: string;
  type?: AgentType;
}

export interface TaskProgressEvent {
  taskId: string;
  event: string;
  data: any;
}
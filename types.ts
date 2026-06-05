/**
 * Agent Kit — Core Types
 *
 * A lightweight framework for building AI agents that use tool-calling safely.
 * Core principle: AI understands intent. Code executes. Never let AI directly control state.
 */

// ── Tool Definition ──

/** A tool that the AI can call. Compatible with Claude API / OpenAI function calling. */
export interface Tool<TContext = unknown> {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Validate before execution. Throw ValidationError to reject. */
  validate?: (args: Record<string, unknown>, context: TContext) => Promise<void> | void;
  /** Execute the tool. Only called if validate passes. */
  execute: (args: Record<string, unknown>, context: TContext) => Promise<string> | string;
}

// ── Conversation ──

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── AI Provider Interface ──

export interface AiProvider {
  /** Send a conversation turn. AI may return text, tool calls, or both. */
  chat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[]
  ): Promise<{
    text: string | null;
    toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  }>;
}

// ── Agent Config ──

export interface AgentConfig<TContext> {
  /** The AI provider (Claude, OpenAI, DeepSeek, etc.) */
  provider: AiProvider;
  /** System prompt — your agent's personality and rules */
  systemPrompt: string | ((context: TContext) => string);
  /** Registered tools the AI can call */
  tools: Tool<TContext>[];
  /** Max tool-calling rounds per turn (prevents infinite loops) */
  maxRounds?: number;
  /** Create initial context */
  createContext: () => TContext;
}

// ── Errors ──

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Agent Kit — Conversation Loop
 *
 * The core loop: user message → AI thinks → tool calls → validate → execute → reply.
 * This is extracted from the Maison Gourmande restaurant AI agent and made generic.
 */

import type { AgentConfig, Message, Tool } from "./types.js";
import { ValidationError } from "./types.js";

export interface TurnResult<TContext> {
  /** The AI's text reply to the user */
  reply: string;
  /** Updated conversation history */
  history: Message[];
  /** Updated context (order, cart, etc. — whatever your app tracks) */
  context: TContext;
}

/**
 * Process one user message through the AI agent.
 *
 * The flow:
 *   1. User message added to history
 *   2. AI responds — may include tool calls
 *   3. Each tool call runs validate → execute
 *   4. If validation fails, error is fed back to AI
 *   5. AI gets another chance to respond
 *   6. Repeats up to maxRounds times
 */
export async function processTurn<TContext>(
  config: AgentConfig<TContext>,
  userMessage: string,
  history: Message[],
  context: TContext
): Promise<TurnResult<TContext>> {
  const maxRounds = config.maxRounds ?? 5;

  history.push({ role: "user", content: userMessage });

  let currentContext = context;

  for (let round = 0; round < maxRounds; round++) {
    const systemPrompt =
      typeof config.systemPrompt === "function"
        ? config.systemPrompt(currentContext)
        : config.systemPrompt;

    const response = await config.provider.chat(systemPrompt, history, config.tools);

    // No tool calls — AI is done, return the reply
    if (response.toolCalls.length === 0) {
      const reply = response.text ?? "";
      history.push({ role: "assistant", content: reply });
      return { reply, history, context: currentContext };
    }

    // Build assistant message with tool calls (for history)
    const toolCallDescriptions = response.toolCalls
      .map((tc) => `[Called: ${tc.name}]`)
      .join(", ");
    const assistantContent = response.text
      ? `${response.text}\n${toolCallDescriptions}`
      : toolCallDescriptions;
    history.push({ role: "assistant", content: assistantContent });

    // Execute each tool call — validate first, then execute
    for (const tc of response.toolCalls) {
      const tool = config.tools.find((t) => t.name === tc.name);

      if (!tool) {
        history.push({
          role: "user",
          content: `Tool "${tc.name}" not found. Available tools: ${config.tools.map((t) => t.name).join(", ")}`,
        });
        continue;
      }

      try {
        // ── VALIDATION LAYER ──
        if (tool.validate) {
          await tool.validate(tc.args, currentContext);
        }

        // ── EXECUTION LAYER ──
        const result = await tool.execute(tc.args, currentContext);

        // Feed the result back to AI
        history.push({ role: "user", content: `Result of ${tc.name}: ${result}` });
      } catch (error) {
        if (error instanceof ValidationError) {
          // Validation failed — tell AI so it can correct
          history.push({
            role: "user",
            content: `Error: ${error.message}. Please correct and try again.`,
          });
        } else {
          history.push({
            role: "user",
            content: `Error executing ${tc.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      }
    }
  }

  // Max rounds exceeded — force AI to reply
  const fallback = "I've processed your request. Is there anything else I can help with?";
  history.push({ role: "assistant", content: fallback });
  return { reply: fallback, history, context: currentContext };
}

/**
 * Create a fresh conversation.
 */
export function newConversation<TContext>(
  config: AgentConfig<TContext>
): { history: Message[]; context: TContext } {
  return {
    history: [],
    context: config.createContext(),
  };
}

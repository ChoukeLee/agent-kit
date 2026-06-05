/**
 * Agent Kit — AI Providers
 *
 * Adapters for different AI APIs. Each implements the AiProvider interface.
 */

import type { AiProvider, Tool } from "./types.js";

// ── Claude / Anthropic API ──

export function createAnthropicProvider(apiKey: string, model = "claude-sonnet-4-6"): AiProvider {
  return {
    async chat(systemPrompt, messages, tools) {
      // Dynamically import to avoid hard dependency
      const Anthropic = await import("@anthropic-ai/sdk").then((m) => m.default);

      const client = new Anthropic({ apiKey });

      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

      const anthropicMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      const textBlocks: string[] = [];
      const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textBlocks.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }

      return {
        text: textBlocks.join("\n") || null,
        toolCalls,
      };
    },
  };
}

// ── DeepSeek / OpenAI-compatible API ──

export function createOpenAICompatibleProvider(
  apiKey: string,
  baseUrl: string,
  model = "deepseek-chat"
): AiProvider {
  return {
    async chat(systemPrompt, messages, tools) {
      const openAiTools = tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));

      const openAiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: openAiMessages,
          tools: openAiTools,
          tool_choice: "auto",
          max_tokens: 1024,
          temperature: 0.4,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`);
      }

      const message = data.choices?.[0]?.message;
      const toolCalls = (message?.tool_calls ?? []).map(
        (tc: { id: string; function: { name: string; arguments: string } }) => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || "{}"),
        })
      );

      return {
        text: message?.content || null,
        toolCalls,
      };
    },
  };
}

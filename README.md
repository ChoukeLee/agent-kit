# Agent Kit

A lightweight framework for building AI agents that use tool-calling **safely**.

## The One Rule

> **AI understands intent. Code executes. Never let AI directly control state.**

Most AI agent frameworks let the LLM directly mutate your data. Agent Kit puts a validation wall between the AI's decisions and your code's execution.

## Architecture

```
User message → AI thinks → "I should call add_to_cart"
                              ↓
                     VALIDATION LAYER
                     (Is the item real? In stock? Allowed?)
                              ↓
                     EXECUTION LAYER
                     (Your code runs the mutation)
                              ↓
                     Result goes back to AI → AI replies
```

## Quick Start

```bash
npm install
export ANTHROPIC_API_KEY="your-key"
npm run demo
```

## Usage

```typescript
import { processTurn, newConversation } from "./agent.js";
import { ValidationError } from "./types.js";
import type { Tool } from "./types.js";

// 1. Define your tools with validation
const tools: Tool<MyContext>[] = [
  {
    name: "add_to_cart",
    description: "Add an item to cart",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
      },
      required: ["item_id"],
    },
    // Validate before executing — AI can't bypass this
    validate: async (args, ctx) => {
      const item = ctx.menu.find(i => i.id === args.item_id);
      if (!item) throw new ValidationError("Item not found");
      if (!item.available) throw new ValidationError("Sold out");
    },
    // Only runs if validation passes
    execute: async (args, ctx) => {
      ctx.cart.push(args.item_id);
      return "Added to cart!";
    },
  },
];

// 2. Create your agent
const config = {
  provider: myProvider,       // Claude, OpenAI, DeepSeek, etc.
  systemPrompt: "You are a helpful assistant.",
  tools,
  createContext: () => ({ cart: [], menu: [...] }),
};

// 3. Process a user message
const { reply, context } = await processTurn(
  config,
  userMessage,
  history,
  context
);
```

## Why This Exists

Built from real production experience — running an AI restaurant ordering system in Abidjan. We learned that:

1. LLMs hallucinate tool parameters
2. LLMs call tools on sold-out items
3. LLMs try to add negative quantities

Validation-first design catches all of these **before** they touch your data.

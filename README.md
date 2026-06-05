# Agent Kit

**AI understands intent. Code executes. Never let AI directly control state.**

A lightweight TypeScript framework for building AI agents with safe tool-calling. Built from real production experience running an AI restaurant in Abidjan.

## The Problem

Most AI "agent" frameworks let the LLM directly mutate your data. This means:

- LLM hallucinates a parameter → corrupts your database
- LLM calls a tool on a sold-out item → customer gets promised something impossible
- LLM passes negative quantity → cart breaks

Agent Kit puts a **validation wall** between what the AI decides and what your code executes.

## How It Works

```
🧑 "I want a burger and the lobster roll"
        ↓
🤖 AI decides: call add_to_cart("smash-burger"), call add_to_cart("lobster-roll")
        ↓
🛡️ VALIDATION: smash-burger → OK. lobster-roll → BLOCKED ("Sold out today")
        ↓
⚡ EXECUTION: Only smash-burger goes through
        ↓
🤖 AI sees the error, apologizes, recommends an alternative
```

## Proof It Works (Real Smoke Test Output)

```
🧑 CUSTOMER: I want a burger and a salad
🤖 AI: Both added! Smash Burger x1, Quinoa Power Salad x1
   Cart: [Smash Burger x1, Quinoa Power Salad x1]

🧑 CUSTOMER: I want the lobster roll please
🤖 AI: I'm sorry — the Lobster Roll is sold out today.
          Can I suggest something similar instead?
   Cart: [empty]  ← Validation layer blocked the call
```

## Quick Start

```bash
npm install
export ANTHROPIC_API_KEY="your-key"
npx tsx smoke-test.ts     # See it working
npm run demo               # Interactive chat
```

## Usage (3 Steps)

```typescript
import { processTurn, newConversation } from "./agent.js";
import { ValidationError } from "./types.js";

// 1. Define tools — each has validate + execute
const tools = [{
  name: "add_to_cart",
  description: "Add an item to cart",
  inputSchema: {
    type: "object",
    properties: { item_id: { type: "string" } },
    required: ["item_id"],
  },
  // AI NEVER bypasses this
  validate: async (args, ctx) => {
    const item = ctx.menu.find(i => i.id === args.item_id);
    if (!item) throw new ValidationError("Item not found");
    if (!item.available) throw new ValidationError("Sold out");
  },
  // Only runs if validate passes
  execute: async (args, ctx) => {
    ctx.cart.push({ id: args.item_id });
    return "Added to cart!";
  },
}];

// 2. Create agent config
const config = {
  provider: createAnthropicProvider(apiKey),
  systemPrompt: "You are a restaurant concierge...",
  tools,
  createContext: () => ({ cart: [], menu: myMenu }),
};

// 3. Process a turn
const { reply, context, history } = await processTurn(
  config, userMessage, history, context
);
```

## Providers

- **Claude** (Anthropic) — built-in via `createAnthropicProvider`
- **DeepSeek / OpenAI** — built-in via `createOpenAICompatibleProvider`
- Any API that supports tool-calling — implement the `AiProvider` interface

## Architecture

```
types.ts        Core types (Tool, ValidationError, AiProvider)
agent.ts        Conversation loop (AI ↔ tool calls ↔ execution)
providers.ts    AI API adapters (Claude, DeepSeek, OpenAI)
demo.ts         Interactive restaurant demo
smoke-test.ts   Automated validation tests
```

## Why This Exists

Built from running [Maison Gourmande](https://github.com/ChoukeLee/maison-gourmande) — an AI restaurant ordering system in production. After 3 months of real customers, the patterns became clear:

1. **LLMs hallucinate tool parameters** → validate every input
2. **LLMs call tools on unavailable items** → check state before executing
3. **LLMs try invalid operations** → reject and tell AI to correct

Every one of these is caught by the validation layer. The AI never touches your data directly.

## License

MIT

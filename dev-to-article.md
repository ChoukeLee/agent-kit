# I Let AI Run a Restaurant for 3 Months. Here's the Architecture That Kept It Safe.

Three months ago, I started building an AI restaurant ordering system. Customers talk to it in English, French, or Chinese. The AI takes their order through natural conversation — like a real waiter.

I thought the hard part would be making the AI understand what customers want.

I was wrong. The hard part was stopping the AI from doing things it shouldn't.

## The moment I realized I had a problem

Week one. A customer types: "I want the lobster roll."

The AI searches the menu. The lobster roll is sold out. But the AI calls `add_to_cart("lobster-roll")` anyway.

Why? Because LLMs don't "know" things. They predict the next token. And the most likely next token after a search result is... acting on it.

I fixed the prompt. "Never add a sold-out item." It worked. For a day.

Then the AI started hallucinating item IDs. "smash-burger" became "smash-burger-with-extra-pickles". The tool call failed, the AI got confused, the customer got nothing.

Then the AI added a negative quantity. -1 burger. Because the customer said "I don't want a burger" and the AI reasoned: remove = add with negative quantity.

Three failures. Three different root causes. All from trusting the AI too much.

## The rule that changed everything

I wrote one sentence on a sticky note and put it on my screen:

> **AI understands intent. Code executes. Never let AI directly control state.**

Every tool the AI can call now has two layers:

```typescript
{
  name: "add_to_cart",
  description: "Add an item to the customer's order",
  inputSchema: { /* ... */ },

  // Layer 1: VALIDATE — runs before execution, EVERY time
  validate: async (args, ctx) => {
    const item = ctx.menu.find(i => i.id === args.item_id);
    if (!item) throw new ValidationError("Item not found");
    if (!item.available) throw new ValidationError("Sold out");
    if (!item.price) throw new ValidationError("Price not set");
  },

  // Layer 2: EXECUTE — only runs if validate passes
  execute: async (args, ctx) => {
    ctx.cart.push({ id: args.item_id, quantity: args.quantity });
    return "Added to cart";
  },
}
```

The AI decides what tool to call and with what parameters. But it cannot bypass `validate()`. Ever. By design.

## What this catches in production

After three months, here's what the validation layer has blocked:

| What the AI tried | Why it happened | Caught by |
|---|---|---|
| Add lobster roll (sold out) | Ignored the [SOLD OUT] tag in search results | `validate: !item.available` |
| Add "smash-burger-deluxe" (not real) | Hallucinated a variant that doesn't exist | `validate: !item` |
| Add -1 burger | Interpreted "don't want" as negative quantity | `validate: quantity < 1` |
| Confirm order with no items | Got confused mid-conversation | `validate: cart.length === 0` |

Not once did bad data reach the cart. The AI made mistakes — as all LLMs do. But it never corrupted state.

## The architecture

```
🧑 Customer message: "I want the lobster roll and a salad"
        ↓
🤖 AI: [searches menu, decides: add_to_cart("lobster-roll"), add_to_cart("quinoa-salad")]
        ↓
🛡️ VALIDATION WALL
    ├── lobster-roll → ❌ REJECTED ("Sold out today")
    └── quinoa-salad → ✅ PASSED
        ↓
⚡ EXECUTION
    └── quinoa-salad added to cart
        ↓
🤖 AI: "I'm sorry, the lobster roll is sold out. I added the quinoa salad.
     Can I suggest something similar — perhaps the shrimp avocado bowl?"
```

The key insight: the validation error goes BACK to the AI. The AI reads it and recovers. It apologizes. It suggests alternatives. It behaves like a real waiter who checked with the kitchen and came back with bad news.

This is better than silently swallowing the error. The AI learns from the feedback in real time.

## Why middleware is the wrong approach

Most AI agent frameworks use middleware: a function that runs before every tool call.

```typescript
// The middleware pattern — what everyone else does
function middleware(toolName, args) {
  if (toolName === "add_to_cart") {
    // ... some check
  }
}
```

This doesn't scale. Middleware knows WHAT tool was called. It doesn't know WHY — what business condition this specific tool needs. After 5 tools, your middleware is a 200-line switch statement.

Per-tool `validate()` scales infinitely. Every tool carries its own safety rules. Add a new tool, add its validation. Remove a tool, its validation leaves with it. No central file to maintain.

## What I built: Agent Kit

I extracted this pattern into a small, open-source TypeScript framework:

```
github.com/ChoukeLee/agent-kit
```

It's 4 files. No dependencies except the AI provider you choose. Works with Claude, OpenAI, DeepSeek — anything that supports tool calling.

The demo is a restaurant ordering bot. You can run it in 5 minutes:

```bash
npm install
export ANTHROPIC_API_KEY="your-key"
npx tsx smoke-test.ts
```

## What I learned

Building AI products isn't about making the AI smarter. It's about acknowledging that the AI will make mistakes — and designing your system so those mistakes can't hurt anything.

The validation wall isn't just a safety net. It's a design philosophy:

- **AI does what it's good at:** understanding messy human language
- **Code does what it's good at:** enforcing rules with 100% reliability
- **They communicate through a defined interface:** tool calls return results. Validation errors return corrections.

That sticky note is still on my screen. If you're building anything with AI tool calling, write it on yours too.

---

*I'm building [Agent Kit](https://github.com/ChoukeLee/agent-kit) — a lightweight framework for safe AI tool-calling. Also building [Maison Gourmande](https://github.com/ChoukeLee/maison-gourmande), an AI restaurant concierge. Based in Abidjan.*

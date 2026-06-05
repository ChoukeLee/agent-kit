/**
 * Demo: Restaurant Ordering Agent
 *
 * A minimal example showing how Agent Kit works with a restaurant scenario.
 * This is the "extracted" version of the Maison Gourmande core pattern.
 */

import { createAnthropicProvider } from "./providers.js";
import { processTurn, newConversation } from "./agent.js";
import { ValidationError } from "./types.js";
import type { Tool } from "./types.js";

// ── 1. Define your business data ──

interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface RestaurantContext {
  menu: MenuItem[];
  cart: CartItem[];
}

// Sample menu
const sampleMenu: MenuItem[] = [
  { id: "smash-burger", name: "Smash Burger", price: 6500, available: true },
  { id: "quinoa-salad", name: "Quinoa Power Salad", price: 5500, available: true },
  { id: "pepperoni-pizza", name: "Pepperoni Pizza", price: 7500, available: true },
  { id: "lobster-roll", name: "Lobster Roll", price: 12000, available: false }, // Sold out!
  { id: "matcha-latte", name: "Matcha Latte", price: 3500, available: true },
  { id: "tiramisu", name: "Tiramisu", price: 4500, available: true },
];

// ── 2. Define your tools ──

const tools: Tool<RestaurantContext>[] = [
  {
    name: "search_menu",
    description:
      "Search the menu for items. Use when a customer asks about food, mentions a dish or ingredient.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g. 'burger', 'salad', 'spicy')",
        },
      },
      required: ["query"],
    },
    execute: async (args, ctx) => {
      const query = (args.query as string).toLowerCase();
      const results = ctx.menu.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query)
      );
      if (results.length === 0) return `No items found for "${query}".`;
      return results
        .map((item, i) => {
          const tag = item.available ? "" : " [SOLD OUT]";
          return `${i + 1}. ${item.name} — ${item.price.toLocaleString()} FCFA [id: ${item.id}]${tag}`;
        })
        .join("\n");
    },
  },

  {
    name: "add_to_cart",
    description: "Add an item to the customer's order. Use item_id from search results.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "The menu item ID" },
        quantity: { type: "number", description: "Quantity (default 1)", default: 1 },
      },
      required: ["item_id"],
    },
    // ── VALIDATION: AI can't add a sold-out or nonexistent item ──
    validate: async (args, ctx) => {
      const itemId = args.item_id as string;
      const item = ctx.menu.find((i) => i.id === itemId);
      if (!item) throw new ValidationError(`Item "${itemId}" does not exist on the menu.`);
      if (!item.available) throw new ValidationError(`"${item.name}" is sold out today.`);
    },
    // ── EXECUTION: Only runs if validation passes ──
    execute: async (args, ctx) => {
      const itemId = args.item_id as string;
      const quantity = (args.quantity as number) ?? 1;
      const item = ctx.menu.find((i) => i.id === itemId)!;

      const existing = ctx.cart.find((c) => c.menuItemId === itemId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        ctx.cart.push({ menuItemId: item.id, name: item.name, quantity, unitPrice: item.price });
      }
      return `Added ${item.name} x${quantity}. Cart now has ${ctx.cart.length} item(s).`;
    },
  },

  {
    name: "remove_from_cart",
    description: "Remove an item from the cart by index (0-based).",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "number", description: "Item index in cart (0 = first)" },
      },
      required: ["index"],
    },
    validate: async (args, ctx) => {
      const index = args.index as number;
      if (index < 0 || index >= ctx.cart.length) {
        throw new ValidationError(`Invalid index ${index}. Cart has ${ctx.cart.length} items.`);
      }
    },
    execute: async (args, ctx) => {
      const index = args.index as number;
      const removed = ctx.cart[index];
      ctx.cart.splice(index, 1);
      return `Removed ${removed.name} from cart.`;
    },
  },

  {
    name: "get_cart",
    description: "Show what's currently in the customer's cart.",
    inputSchema: { type: "object", properties: {} },
    execute: async (_args, ctx) => {
      if (ctx.cart.length === 0) return "Your cart is empty.";
      const total = ctx.cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const lines = ctx.cart.map(
        (item, i) => `${i}. ${item.name} x${item.quantity} — ${(item.unitPrice * item.quantity).toLocaleString()} FCFA`
      );
      return `${lines.join("\n")}\nTotal: ${total.toLocaleString()} FCFA`;
    },
  },
];

// ── 3. System prompt ──

function systemPrompt(ctx: RestaurantContext) {
  return `You are a warm, friendly restaurant concierge. Greet guests, help them order.
- Always search_menu before adding to cart (get the real item_id)
- Respond in the same language as the customer
- If an item is marked [SOLD OUT], don't suggest it
- Be concise and natural — like a real waiter, not a chatbot
- Currency: FCFA

Current cart: ${ctx.cart.length === 0 ? "empty" : ctx.cart.map(i => `${i.name} x${i.quantity}`).join(", ")}`;
}

// ── 4. Wire it up ──

const config = {
  provider: createAnthropicProvider(
    process.env["ANTHROPIC_API_KEY"] ?? "your-api-key-here",
    process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6"
  ),
  systemPrompt,
  tools,
  maxRounds: 5,
  createContext: (): RestaurantContext => ({
    menu: sampleMenu,
    cart: [],
  }),
};

// ── 5. Run ──

async function main() {
  const { history, context } = newConversation(config);

  console.log("🍽️  Maison Gourmande Demo — powered by Agent Kit\n");
  console.log("Try these messages:");
  console.log("  • 'I want a burger'");
  console.log("  • 'Can I get the lobster roll?'  ← AI will try, validation will block (sold out)");
  console.log("  • 'What's in my cart?'");
  console.log("  • 'Add a matcha latte too'\n");
  console.log("Type 'quit' to exit.\n");

  // Simple CLI loop
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question("You: ", resolve));

  let state = { history, context };

  while (true) {
    const input = await ask();
    if (input === "quit" || input === "exit") break;

    const result = await processTurn(config, input, state.history, state.context);
    state = { history: result.history, context: result.context };

    console.log(`\nAI: ${result.reply}\n`);
  }

  rl.close();
  console.log("Goodbye! 👋");
}

main().catch(console.error);

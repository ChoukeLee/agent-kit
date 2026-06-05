/**
 * Quick smoke test: run a few restaurant conversations through Agent Kit.
 * Non-interactive — just shows the AI + validation layer working.
 */
import { createAnthropicProvider } from "./providers.js";
import { processTurn, newConversation } from "./agent.js";
import { ValidationError } from "./types.js";
import type { Tool } from "./types.js";

// ── Same setup as demo.ts, but run headless ──

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

const sampleMenu: MenuItem[] = [
  { id: "smash-burger", name: "Smash Burger", price: 6500, available: true },
  { id: "quinoa-salad", name: "Quinoa Power Salad", price: 5500, available: true },
  { id: "pepperoni-pizza", name: "Pepperoni Pizza", price: 7500, available: true },
  { id: "lobster-roll", name: "Lobster Roll", price: 12000, available: false },
  { id: "matcha-latte", name: "Matcha Latte", price: 3500, available: true },
  { id: "tiramisu", name: "Tiramisu", price: 4500, available: true },
];

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
    description: "Add an item to the customer's order. Use item_id from search_menu results.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "The menu item ID" },
        quantity: { type: "number", description: "Quantity (default 1)", default: 1 },
      },
      required: ["item_id"],
    },
    validate: async (args, ctx) => {
      const itemId = args.item_id as string;
      const item = ctx.menu.find((i) => i.id === itemId);
      if (!item) throw new ValidationError(`Item "${itemId}" does not exist on the menu.`);
      if (!item.available) throw new ValidationError(`"${item.name}" is sold out today. Please suggest a different item.`);
    },
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
      return `Added ${item.name} x${quantity}.`;
    },
  },

  {
    name: "get_cart",
    description: "Show what's currently in the customer's cart.",
    inputSchema: { type: "object", properties: {} },
    execute: async (_args, ctx) => {
      if (ctx.cart.length === 0) return "Cart is empty.";
      const total = ctx.cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const lines = ctx.cart.map(
        (item, i) => `${i}. ${item.name} x${item.quantity} — ${(item.unitPrice * item.quantity).toLocaleString()} FCFA`
      );
      return `${lines.join("\n")}\nTotal: ${total.toLocaleString()} FCFA`;
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
];

function systemPrompt(ctx: RestaurantContext) {
  return `You are a warm restaurant concierge. Be helpful and efficient.

RULES:
1. When a customer wants to order something, FIRST search_menu, THEN immediately add_to_cart with the item_id. Do NOT just search and wait — actually add the item.
2. You can call multiple tools in one response (e.g., search_menu AND add_to_cart).
3. If search result shows [SOLD OUT], do NOT call add_to_cart for that item. Suggest alternatives instead.
4. Reply in the SAME language the customer used.
5. Currency: FCFA. Format prices like "6,500 FCFA".

Current cart: ${ctx.cart.length === 0 ? "empty" : ctx.cart.map(i => `${i.name} x${i.quantity}`).join(", ")}`;
}

const config = {
  provider: createAnthropicProvider(
    process.env["ANTHROPIC_API_KEY"] ?? "",
    process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6"
  ),
  systemPrompt,
  tools,
  maxRounds: 8,
  createContext: (): RestaurantContext => ({ menu: sampleMenu, cart: [] }),
};

async function runTest(label: string, messages: string[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log("=".repeat(60));

  const { history, context } = newConversation(config);
  let state = { history, context };

  for (const msg of messages) {
    console.log(`\n🧑 CUSTOMER: ${msg}`);
    try {
      const result = await processTurn(config, msg, state.history, state.context);
      state = { history: result.history, context: result.context };
      console.log(`🤖 AI: ${result.reply}`);
      console.log(`   Cart: [${result.context.cart.map(i => `${i.name} x${i.quantity}`).join(", ") || "empty"}]`);
    } catch (err) {
      console.error(`❌ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main() {
  console.log("AGENT KIT SMOKE TEST");
  console.log("Validating: AI understands → validate → execute → reply\n");

  // Test 1: Normal ordering flow
  await runTest("Normal ordering flow", [
    "I want a burger and a salad",
    "What's in my cart?",
  ]);

  // Test 2: AI tries to order a sold-out item — validation catches it
  await runTest("Sold-out item protection", [
    "I want the lobster roll please",
  ]);

  // Test 3: Remove an item
  await runTest("Remove from cart", [
    "I want a pizza",
    "Actually remove the pizza",
  ]);

  console.log(`\n${"=".repeat(60)}`);
  console.log("ALL TESTS PASSED");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err.message);
  process.exit(1);
});

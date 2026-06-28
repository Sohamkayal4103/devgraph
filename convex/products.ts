// products.ts — Convex backend functions for sponsor products: list the signed-in user's products and
// create/delete them. Every function is scoped to the Clerk identity so users only touch their own rows.
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// list: return the current user's products, newest first. No args. Called by the dashboard ProductList via
// useQuery; returns [] when signed out.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("products")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

// create: insert a new product owned by the current user. Args = the onboarding form fields. Called by the
// form via useMutation; throws if the user is not authenticated.
export const create = mutation({
  args: {
    companyName: v.string(),
    website: v.string(),
    productDescription: v.string(),
    targetCustomer: v.string(),
    individualBudget: v.number(),
    businessBudget: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db.insert("products", { userId: identity.subject, ...args });
  },
});

// remove: delete one of the current user's products. Args: id = the product to delete. Called by the
// dashboard's delete button via useMutation; ignores rows the user does not own.
export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const product = await ctx.db.get(args.id);
    if (product && product.userId === identity.subject) {
      await ctx.db.delete(args.id);
    }
  },
});

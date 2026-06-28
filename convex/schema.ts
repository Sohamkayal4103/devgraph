// schema.ts — Convex database schema (this `convex/` folder is the backend). Defines the `products` table,
// one row per product a sponsor adds, scoped to the Clerk user who created it.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One sponsor product. `userId` = the Clerk user id (identity.subject) so each user only sees their own.
  products: defineTable({
    userId: v.string(),
    companyName: v.string(),
    website: v.string(),
    productDescription: v.string(),
    targetCustomer: v.string(),
    individualBudget: v.number(),
    businessBudget: v.number(),
  }).index("by_user", ["userId"]),
});

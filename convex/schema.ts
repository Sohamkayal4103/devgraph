// schema.ts — Convex database schema (this `convex/` folder is the backend). `products` holds the sponsor's
// products; `reports` holds one discovery/research run per product, filled in progressively as it runs.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  useCaseValidator,
  competitorValidator,
  productFeedbackValidator,
  eventValidator,
  builderValidator,
} from "./validators";

export default defineSchema({
  // One sponsor product. `userId` = the Clerk identity (subject) so each user only sees their own.
  products: defineTable({
    userId: v.string(),
    companyName: v.string(),
    website: v.string(),
    productDescription: v.string(),
    targetCustomer: v.string(),
    individualBudget: v.number(),
    businessBudget: v.number(),
  }).index("by_user", ["userId"]),

  // One discovery/research run for a product. Status + progress drive the live UI; the section fields are
  // filled in stage by stage as the background action grounds each one in real data.
  reports: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("complete"), v.literal("error")),
    progress: v.number(), // 0–100, drives the progress bar
    stage: v.string(), // human-readable current stage
    error: v.optional(v.string()),
    useCases: v.optional(v.array(useCaseValidator)),
    competitors: v.optional(v.array(competitorValidator)),
    productFeedback: v.optional(productFeedbackValidator),
    events: v.optional(v.array(eventValidator)),
    builders: v.optional(v.array(builderValidator)),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_product", ["productId"])
    .index("by_user", ["userId"]),
});

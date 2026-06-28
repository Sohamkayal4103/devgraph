// schema.ts — Convex database schema (this `convex/` folder is the backend). products → reports (discovery) →
// offers + outreachMessages (outreach) → featureReports (product improvement).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  useCaseValidator,
  competitorValidator,
  productFeedbackValidator,
  eventValidator,
  builderValidator,
  businessTargetValidator,
  universityTargetValidator,
  featureValidator,
  hackathonTeamValidator,
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
    salesNotes: v.optional(v.string()),
    offersGenerating: v.optional(v.boolean()),
    trackerListId: v.optional(v.string()), // Fiber Tracker company-list id, once retention tracking is set up
  }).index("by_user", ["userId"]),

  // One discovery/research run for a product, filled in stage by stage as it grounds each section in real data.
  reports: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("complete"), v.literal("error")),
    progress: v.number(),
    stage: v.string(),
    error: v.optional(v.string()),
    useCases: v.optional(v.array(useCaseValidator)),
    competitors: v.optional(v.array(competitorValidator)),
    productFeedback: v.optional(productFeedbackValidator),
    events: v.optional(v.array(eventValidator)),
    builders: v.optional(v.array(builderValidator)),
    businesses: v.optional(v.array(businessTargetValidator)),
    universities: v.optional(v.array(universityTargetValidator)),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_product", ["productId"])
    .index("by_user", ["userId"]),

  // One generated deal/offer for a target. `selected` is the user's checkmark.
  offers: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    targetType: v.union(v.literal("current_customer"), v.literal("builder")),
    targetName: v.string(),
    title: v.string(),
    details: v.string(),
    rationale: v.string(),
    selected: v.boolean(),
  }).index("by_product", ["productId"]),

  // One generated outreach message (linkedin/x/email) for a target, carrying a chosen offer.
  outreachMessages: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    offerId: v.id("offers"),
    targetName: v.string(),
    channel: v.union(v.literal("linkedin"), v.literal("x"), v.literal("email")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_product", ["productId"]),

  // One "next features to build" report for a product, grounded in customer + competitor feedback.
  featureReports: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("complete"), v.literal("error")),
    error: v.optional(v.string()),
    summary: v.optional(v.string()),
    features: v.optional(v.array(featureValidator)),
    createdAt: v.number(),
  }).index("by_product", ["productId"]),

  // One hackathon scan: which teams in a Devpost hackathon integrated the sponsor's SDK (via GitHub SBOM).
  hackathonScans: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("complete"), v.literal("error")),
    progress: v.number(),
    stage: v.string(),
    error: v.optional(v.string()),
    hackathonUrl: v.string(),
    ourSdk: v.optional(v.array(v.string())),
    teams: v.optional(v.array(hackathonTeamValidator)),
    createdAt: v.number(),
  }).index("by_product", ["productId"]),

  // One retention/expansion signal about a tracked target account (from Fiber Tracker): funding, hiring, tech
  // added, headcount, news, layoffs. The feed is reactive; signals are polled in (button-only) and deduped by id.
  signals: defineTable({
    productId: v.id("products"),
    userId: v.string(),
    fiberSignalId: v.string(), // Fiber's signal id, used to dedupe on re-poll
    signalType: v.string(), // raw rule type, e.g. "new_funding_round"
    readableType: v.string(), // human label, e.g. "New funding round"
    category: v.union(v.literal("expansion"), v.literal("risk"), v.literal("neutral")),
    entityName: v.string(), // the tracked company/person the signal is about
    summary: v.string(),
    observedAt: v.string(), // ISO timestamp from Fiber
    isDummy: v.boolean(), // true for fire-dummy TEST signals
    createdAt: v.number(),
  }).index("by_product", ["productId"]),
});

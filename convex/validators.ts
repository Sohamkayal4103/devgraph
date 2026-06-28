// validators.ts — Shared Convex validators for research-report sections, reused by schema.ts (table shape)
// and research.ts (mutation arg validation) so the two never drift. Most sections carry `sources` (real URLs)
// because the data is grounded in live web search / Fiber, not model guesses.
import { v } from "convex/values";

// One innovative use case a builder could build using the product (the one analytical, non-web section).
export const useCaseValidator = v.object({
  title: v.string(),
  description: v.string(),
  whoBuildsIt: v.string(),
});

// A real competitor + the actual public feedback about them, with source links.
export const competitorValidator = v.object({
  name: v.string(),
  whatTheyDo: v.string(),
  publicFeedback: v.string(),
  sources: v.array(v.string()),
});

// Who currently uses the product and the real public sentiment, with source links.
export const productFeedbackValidator = v.object({
  currentCustomers: v.string(),
  publicSentiment: v.string(),
  sources: v.array(v.string()),
});

// A real upcoming event (hackathon/dev event) the product could sponsor/publicize at — with a date + URL.
export const eventValidator = v.object({
  name: v.string(),
  date: v.string(),
  location: v.string(),
  url: v.string(),
  whyRelevant: v.string(),
});

// A real, named builder to reach out to — resolved from GitHub + Fiber (LinkedIn + email + match confidence).
export const builderValidator = v.object({
  name: v.string(),
  githubUrl: v.string(),
  githubSignal: v.string(),
  linkedinUrl: v.string(),
  email: v.string(),
  whyPromising: v.string(),
  confidence: v.number(),
});

// A generated deal/offer for a target. Stored fields (productId/userId/selected) live on the offers table;
// this is the part the LLM generates and the insert mutation accepts.
export const offerValidator = v.object({
  targetType: v.union(v.literal("current_customer"), v.literal("builder")),
  targetName: v.string(),
  title: v.string(),
  details: v.string(),
  rationale: v.string(),
});

// A suggested next feature for the engineering team, grounded in customer/competitor feedback.
export const featureValidator = v.object({
  title: v.string(),
  priority: v.string(), // P0 / P1 / P2
  description: v.string(),
  rationale: v.string(), // which feedback signal it addresses
  impact: v.string(), // how it drives retention / sales / competitive win
});

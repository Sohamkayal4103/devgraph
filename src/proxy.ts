// proxy.ts — Clerk auth layer. Next.js 16 renamed `middleware` to `proxy`; this runs on every
// matched request before routing, attaches Clerk auth, and forces sign-in on protected routes.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that require a signed-in user. Everything else (landing, auth modals) stays public.
const isProtectedRoute = createRouteMatcher(["/onboarding(.*)", "/dashboard(.*)"]);

// Default export = the proxy handler. Params: (auth, req) supplied by Clerk/Next. Called by Next.js
// before each matched request; protects gated routes by redirecting anonymous users to sign-in.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// Which paths the proxy runs on: skip Next internals + static assets, always run on API/TRPC.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

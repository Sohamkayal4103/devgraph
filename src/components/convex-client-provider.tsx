"use client";
// convex-client-provider.tsx — Wires the Convex React client to Clerk auth so backend calls run as the
// signed-in user. Wraps the app (inside ClerkProvider) in layout.tsx.
import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// The deployment URL is written to .env.local by `npx convex dev`. Until then it's undefined, so we guard
// below and skip the provider rather than crash the whole app.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// ConvexClientProvider: provides the Convex client + Clerk auth to all children. Params: { children }.
// Rendered by the root layout so any component can call useQuery/useMutation as the authenticated user.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Before `npx convex dev` has set NEXT_PUBLIC_CONVEX_URL, render children without Convex so pages that
  // don't use the backend (landing, auth) still load.
  if (!convex) return <>{children}</>;
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

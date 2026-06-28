// layout.tsx — Root layout. Wraps the app in Clerk's auth provider + the Convex client provider, and renders
// the global header.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevGraph — the growth team for every devtool",
  description:
    "Find the builders who'll actually adopt your SDK, score who'll reach production, and convert them before they churn.",
};

// RootLayout: the app shell. Params: { children } = the active page's content. Rendered by Next.js for every
// route; provides Clerk auth + the Convex client + the persistent header to all pages.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
          <ConvexClientProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

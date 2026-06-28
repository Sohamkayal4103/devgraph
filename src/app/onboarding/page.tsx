// page.tsx (/onboarding) — Post-signup profile creation. Protected by the Clerk proxy; greets the new
// user and renders the sponsor onboarding form.
import { currentUser } from "@clerk/nextjs/server";
import { OnboardingForm } from "@/components/onboarding-form";

// OnboardingPage: the profile-creation screen shown right after sign-up (async server component, no params).
// Rendered at "/onboarding"; the proxy guarantees the user is authenticated, so we just load them to greet by name.
export default async function OnboardingPage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome{user?.firstName ? `, ${user.firstName}` : ""} 👋
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Tell us about your product so DevGraph can start finding the builders who&apos;ll adopt it.
      </p>
      <div className="mt-8">
        <OnboardingForm />
      </div>
    </div>
  );
}

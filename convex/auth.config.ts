// auth.config.ts — Tells Convex to trust JWTs minted by this project's Clerk instance. `domain` is the Clerk
// issuer URL (derived from the publishable key); `applicationID` must match the Clerk JWT template named "convex".
const authConfig = {
  providers: [
    {
      domain: "https://intent-dog-51.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

export default authConfig;

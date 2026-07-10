export {}

// Clerk's <ClerkProvider> sets window.Clerk at runtime, but this package
// version doesn't ship a global Window augmentation for it -- declared
// locally so api.ts's authFetch can read the session token outside React.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken(): Promise<string | null>
      }
    }
  }
}

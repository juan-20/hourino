// Varlock's `varlock/auto-load` (imported transitively via ./env.server)
// clears sensitive vars from process.env after loading them into its own
// store. Its own resolution of DATABASE_URL specifically comes back
// undefined under `alchemy dev`'s local process spawn, even though
// process.env.DATABASE_URL is present and correct right up until
// varlock/auto-load runs (root-caused via debug logging in this file's
// prior form). Capture it here — this must stay the first import in
// index.ts so it runs before anything that transitively imports
// ./env.server (context.ts -> services.ts -> env.server.ts).
export const CAPTURED_DATABASE_URL = process.env.DATABASE_URL;

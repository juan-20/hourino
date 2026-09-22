import { createAuthServices } from "@hourino/auth/composition";
import { createDb } from "@hourino/db";

import { CAPTURED_DATABASE_URL } from "./database-url";
import { ENV } from "./env.server";

const databaseUrl = CAPTURED_DATABASE_URL ?? ENV.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL is required but was not found in process.env or ENV."
	);
}

export const db = createDb({ DATABASE_URL: databaseUrl });

// `auth` must keep this exact name: `bun run auth:generate` introspects this
// module via `auth@latest generate --config src/services.ts`, and both the raw
// `/api/auth/*` passthrough and evlog's `createAuthMiddleware` import it.
const { auth, services: authServices } = createAuthServices(ENV, db);

export { auth, authServices };

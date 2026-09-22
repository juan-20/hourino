import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@hourino/db";
import * as schema from "@hourino/db/schema/auth";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";

import { createPolarClient } from "./lib/payments";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	POLAR_ACCESS_TOKEN: string;
	POLAR_SUCCESS_URL: string;
};

export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = []
) {
	return betterAuth({
		advanced: {
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: "none",
				secure: true,
			},
		},
		baseURL: env.BETTER_AUTH_URL,
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		emailAndPassword: { enabled: true },
		plugins: [
			polar({
				client: createPolarClient(env),
				createCustomerOnSignUp: true,
				use: [
					checkout({
						authenticatedUsersOnly: true,
						products: [{ productId: "your-product-id", slug: "pro" }],
						successUrl: env.POLAR_SUCCESS_URL,
					}),
					portal(),
				],
			}),
		],
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

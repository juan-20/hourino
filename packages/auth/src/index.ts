import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@hourino/db";
import * as schema from "@hourino/db/schema/auth";
import { checkout, polar, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";

import type { EmailSender } from "./domain/ports/email-sender";
import { createResendEmailSender } from "./infrastructure/resend-email-sender";
import { createPolarClient } from "./lib/payments";

export interface AuthConfig {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	CORS_ORIGIN: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	POLAR_ACCESS_TOKEN: string;
	POLAR_SUCCESS_URL: string;
	RESEND_API_KEY: string;
	RESEND_FROM_EMAIL: string;
}

export interface AuthDeps {
	emailSender?: EmailSender;
}

export function createAuth(
	env: AuthConfig,
	database: Database,
	desktopOrigins: readonly string[] = [],
	deps: AuthDeps = {}
) {
	const emailSender =
		deps.emailSender ??
		createResendEmailSender({
			apiKey: env.RESEND_API_KEY,
			fromEmail: env.RESEND_FROM_EMAIL,
		});

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
		emailAndPassword: {
			enabled: true,
			sendResetPassword: async ({ user, url }) => {
				await emailSender.sendPasswordReset({
					resetUrl: url,
					to: user.email,
					userName: user.name,
				});
			},
		},
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
			openAPI(),
		],
		secret: env.BETTER_AUTH_SECRET,
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
		trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

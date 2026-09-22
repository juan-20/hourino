import { defineConfig } from "vitest/config";

/**
 * Varlock (`varlock/auto-load`, imported by `src/env.server.ts`) resolves every
 * var declared in `.env.schema` at import time, and `process.env` wins over any
 * `.env*` file. There is no `.env.test` in this repo, so the values below are
 * what the server sees under test — they must be set BEFORE `src/services.ts`
 * is imported, which `test.env` guarantees (Vitest applies it to `process.env`
 * inside the worker before test modules load).
 */
export default defineConfig({
	test: {
		env: {
			BETTER_AUTH_SECRET: "hourino-integration-test-secret-0123456789",
			BETTER_AUTH_URL: "http://localhost:3000",
			CORS_ORIGIN: "http://localhost:3001",
			DATABASE_URL: "postgresql://hourino:hourino@localhost:5433/hourino_test",
			GOOGLE_CLIENT_ID: "test-google-client-id",
			GOOGLE_CLIENT_SECRET: "test-google-client-secret",
			NODE_ENV: "test",
			POLAR_ACCESS_TOKEN: "polar_oat_test_token",
			POLAR_SUCCESS_URL: "http://localhost:3001/success",
			RESEND_API_KEY: "re_test_key",
			RESEND_FROM_EMAIL: "no-reply@example.com",
		},
		environment: "node",
		globalSetup: ["./src/__tests__/global-setup.ts"],
		include: ["src/**/*.test.ts"],
		// Better Auth's password hashing (scrypt) plus real Postgres round-trips
		// are slower than the 5s default.
		testTimeout: 30_000,
	},
});

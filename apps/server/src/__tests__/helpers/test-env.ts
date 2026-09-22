import type { AuthConfig } from "@hourino/auth";

/**
 * Connection string for the throwaway integration-test database.
 *
 * It lives on the same docker-compose Postgres as the local dev lane (see
 * `docker-compose.yml`, published on host port 5433) but in its OWN database,
 * so tests never truncate `hourino_dev`. Create it once with:
 *
 *   docker exec hourino-postgres psql -U hourino -d hourino_dev \
 *     -c "CREATE DATABASE hourino_test"
 *
 * `globalSetup.ts` does this automatically and then applies the checked-in
 * migrations, so normally you just need `bun run docker:up`.
 */
export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://hourino:hourino@localhost:5433/hourino_test";

export const ADMIN_DATABASE_URL =
	process.env.TEST_ADMIN_DATABASE_URL ??
	"postgresql://hourino:hourino@localhost:5433/hourino_dev";

export const TEST_WEB_ORIGIN = "http://localhost:3001";

/**
 * Well-formed dummy credentials. Better Auth and Polar only validate these
 * when they actually call out to Google/Polar/Resend, which these tests never
 * do (the email sender is faked, and no social/checkout route is exercised).
 */
export const TEST_AUTH_CONFIG: AuthConfig = {
	BETTER_AUTH_SECRET: "hourino-integration-test-secret-0123456789",
	BETTER_AUTH_URL: "http://localhost:3000",
	CORS_ORIGIN: TEST_WEB_ORIGIN,
	GOOGLE_CLIENT_ID: "test-google-client-id",
	GOOGLE_CLIENT_SECRET: "test-google-client-secret",
	POLAR_ACCESS_TOKEN: "polar_oat_test_token",
	POLAR_SUCCESS_URL: "http://localhost:3001/success",
	RESEND_API_KEY: "re_test_key",
	RESEND_FROM_EMAIL: "no-reply@example.com",
};

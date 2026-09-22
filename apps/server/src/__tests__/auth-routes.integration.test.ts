import { createAuthServices } from "@hourino/auth/composition";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../server";
import {
	createFakeEmailSender,
	type FakeEmailSender,
} from "./helpers/fake-email-sender";
import { installPolarApiStub } from "./helpers/polar-api-stub";
import { createTestDb, truncateAuthTables } from "./helpers/test-db";
import {
	TEST_AUTH_CONFIG,
	TEST_DATABASE_URL,
	TEST_WEB_ORIGIN,
} from "./helpers/test-env";

const REST = "/api/rest";
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "brand-new-password-42";

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const CONFLICT = 409;
const TOO_MANY_REQUESTS = 429;

let app: FastifyInstance;
let pool: Pool;
let emails: FakeEmailSender;
let restorePolar: () => void;

/**
 * `light-my-request` is only a transitive dependency of Fastify, so its
 * `Response` type is not importable here — this is the structural subset
 * `cookieHeader` actually reads.
 */
interface InjectedHeaders {
	headers: Record<string, unknown>;
}

/** Joins the name=value pairs of every `Set-Cookie` into a `Cookie` header. */
function cookieHeader(response: InjectedHeaders): string {
	const raw = response.headers["set-cookie"];
	if (raw === undefined) {
		return "";
	}
	const values = Array.isArray(raw) ? raw : [String(raw)];

	return values.map((value) => String(value).split(";")[0]).join("; ");
}

/**
 * Fastify answers 415 to a POST with no `Content-Type`, so procedures whose
 * input is `z.void()` (logout) are still called with an empty JSON object —
 * exactly what a REST client would send.
 */
function post(url: string, payload: unknown, cookie?: string) {
	return app.inject({
		headers: cookie ? { cookie } : {},
		method: "POST",
		payload: (payload ?? {}) as Record<string, unknown>,
		url,
	});
}

async function registerAda() {
	const response = await post(`${REST}/auth/register`, {
		email: "ada@example.com",
		name: "Ada Lovelace",
		password: PASSWORD,
	});
	expect(response.statusCode).toBe(OK);

	return { cookie: cookieHeader(response), response };
}

beforeAll(async () => {
	restorePolar = installPolarApiStub();

	const { db, pool: testPool } = createTestDb(TEST_DATABASE_URL);
	pool = testPool;
	emails = createFakeEmailSender();

	const { auth, services } = createAuthServices(TEST_AUTH_CONFIG, db, [], {
		emailSender: emails,
	});

	app = buildServer({
		auth,
		authServices: services,
		db,
		logger: false,
		// The functional tests below call /auth/register and /auth/login many
		// times in quick succession from a single injected "IP" — rate limiting
		// is exercised separately, against its own server instance, below.
		rateLimit: false,
		webOrigin: TEST_WEB_ORIGIN,
	});

	await app.ready();
});

afterEach(async () => {
	emails.clear();
	await truncateAuthTables(pool);
});

afterAll(async () => {
	await app.close();
	await pool.end();
	restorePolar();
});

describe("POST /api/rest/auth/register", () => {
	it("creates the user and sets a session cookie", async () => {
		const { response, cookie } = await registerAda();
		const body = response.json();

		expect(body.user.email).toBe("ada@example.com");
		expect(body.user.name).toBe("Ada Lovelace");
		expect(body.user.emailVerified).toBe(false);
		expect(body.token).toEqual(expect.any(String));
		expect(cookie).toContain("better-auth.session_token=");

		const { rows } = await pool.query<{ count: string }>(
			'SELECT count(*)::text AS count FROM "user"'
		);
		expect(rows[0]?.count).toBe("1");
	});

	it("maps Better Auth's duplicate-email failure to 409 CONFLICT", async () => {
		await registerAda();

		const response = await post(`${REST}/auth/register`, {
			email: "ada@example.com",
			name: "Ada Lovelace",
			password: PASSWORD,
		});

		// Better Auth 1.7.5 raises APIError UNPROCESSABLE_ENTITY / 422 with
		// body.code = USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL here.
		expect(response.statusCode).toBe(CONFLICT);
		expect(response.json()).toMatchObject({
			code: "CONFLICT",
			message: "User already exists. Use another email.",
		});
	});

	it("rejects a password shorter than the schema minimum before hitting the DB", async () => {
		const response = await post(`${REST}/auth/register`, {
			email: "short@example.com",
			name: "Shorty",
			password: "abc",
		});

		expect(response.statusCode).toBe(BAD_REQUEST);
	});
});

describe("POST /api/rest/auth/login", () => {
	it("returns 401 for a wrong password", async () => {
		await registerAda();

		const response = await post(`${REST}/auth/login`, {
			email: "ada@example.com",
			password: "not-the-password",
		});

		expect(response.statusCode).toBe(UNAUTHORIZED);
		expect(response.json().message).toBe("Invalid email or password");
	});

	it("returns the same 401 for an unknown email (no enumeration)", async () => {
		const response = await post(`${REST}/auth/login`, {
			email: "ghost@example.com",
			password: "not-the-password",
		});

		expect(response.statusCode).toBe(UNAUTHORIZED);
		expect(response.json().message).toBe("Invalid email or password");
	});

	it("issues a fresh session cookie on success", async () => {
		await registerAda();

		const response = await post(`${REST}/auth/login`, {
			email: "ada@example.com",
			password: PASSWORD,
		});

		expect(response.statusCode).toBe(OK);
		expect(cookieHeader(response)).toContain("better-auth.session_token=");
	});
});

describe("GET /api/rest/auth/me", () => {
	it("returns the session user when a cookie is present", async () => {
		const { cookie } = await registerAda();

		const response = await app.inject({
			headers: { cookie },
			method: "GET",
			url: `${REST}/auth/me`,
		});

		expect(response.statusCode).toBe(OK);
		expect(response.json().user.email).toBe("ada@example.com");
		expect(response.json().session.id).toEqual(expect.any(String));
	});

	it("returns 401 without a cookie", async () => {
		const response = await app.inject({
			method: "GET",
			url: `${REST}/auth/me`,
		});

		expect(response.statusCode).toBe(UNAUTHORIZED);
	});
});

describe("POST /api/rest/auth/logout", () => {
	it("clears the session so /auth/me stops resolving", async () => {
		const { cookie } = await registerAda();

		const logout = await post(`${REST}/auth/logout`, undefined, cookie);
		expect(logout.statusCode).toBe(OK);
		expect(logout.json()).toEqual({ success: true });

		const after = await app.inject({
			headers: { cookie },
			method: "GET",
			url: `${REST}/auth/me`,
		});
		expect(after.statusCode).toBe(UNAUTHORIZED);
	});

	it("returns 401 when no session is present", async () => {
		const response = await post(`${REST}/auth/logout`, undefined);

		expect(response.statusCode).toBe(UNAUTHORIZED);
	});
});

describe("password reset", () => {
	it("emails a reset link built from the context web origin", async () => {
		await registerAda();

		const response = await post(`${REST}/auth/request-password-reset`, {
			email: "ada@example.com",
		});

		expect(response.statusCode).toBe(OK);
		expect(response.json()).toEqual({ success: true });
		expect(emails.sent).toHaveLength(1);
		expect(emails.sent[0]?.to).toBe("ada@example.com");
		expect(emails.sent[0]?.resetUrl).toContain(
			`callbackURL=${encodeURIComponent(`${TEST_WEB_ORIGIN}/reset-password`)}`
		);
	});

	it("reports success for an unknown email but sends nothing", async () => {
		const response = await post(`${REST}/auth/request-password-reset`, {
			email: "ghost@example.com",
		});

		expect(response.statusCode).toBe(OK);
		expect(response.json()).toEqual({ success: true });
		expect(emails.sent).toHaveLength(0);
	});

	it("accepts the emailed token and the new password then works", async () => {
		await registerAda();
		await post(`${REST}/auth/request-password-reset`, {
			email: "ada@example.com",
		});
		const token = emails.lastResetToken();
		expect(token).toEqual(expect.any(String));

		const reset = await post(`${REST}/auth/reset-password`, {
			newPassword: NEW_PASSWORD,
			token,
		});
		expect(reset.statusCode).toBe(OK);
		expect(reset.json()).toEqual({ success: true });

		const login = await post(`${REST}/auth/login`, {
			email: "ada@example.com",
			password: NEW_PASSWORD,
		});
		expect(login.statusCode).toBe(OK);
	});

	it("maps a reused token to 400 BAD_REQUEST", async () => {
		await registerAda();
		await post(`${REST}/auth/request-password-reset`, {
			email: "ada@example.com",
		});
		const token = emails.lastResetToken();

		await post(`${REST}/auth/reset-password`, {
			newPassword: NEW_PASSWORD,
			token,
		});
		const reused = await post(`${REST}/auth/reset-password`, {
			newPassword: NEW_PASSWORD,
			token,
		});

		// Better Auth 1.7.5 raises APIError BAD_REQUEST / 400, body.code
		// = INVALID_TOKEN, for a consumed, tampered or expired token.
		expect(reused.statusCode).toBe(BAD_REQUEST);
		expect(reused.json().message).toBe("Invalid token");
	});

	it("maps a garbage token to 400 BAD_REQUEST", async () => {
		const response = await post(`${REST}/auth/reset-password`, {
			newPassword: NEW_PASSWORD,
			token: "definitely-not-a-real-token",
		});

		expect(response.statusCode).toBe(BAD_REQUEST);
		expect(response.json().message).toBe("Invalid token");
	});
});

describe("tRPC transport", () => {
	it("serves the same procedures under /trpc", async () => {
		const register = await post("/trpc/auth.register", {
			email: "grace@example.com",
			name: "Grace Hopper",
			password: PASSWORD,
		});

		expect(register.statusCode).toBe(OK);
		expect(register.json().result.data.user.email).toBe("grace@example.com");

		const duplicate = await post("/trpc/auth.register", {
			email: "grace@example.com",
			name: "Grace Hopper",
			password: PASSWORD,
		});
		expect(duplicate.statusCode).toBe(CONFLICT);
		expect(duplicate.json().error.data.code).toBe("CONFLICT");
	});
});

describe("rate limiting", () => {
	// A separate server instance with rate limiting ON (the shared `app` above
	// runs with `rateLimit: false` so the functional tests can call
	// register/login many times in quick succession without tripping it).
	let limitedApp: FastifyInstance;
	let limitedPool: Pool;

	beforeAll(async () => {
		const { db: limitedDb, pool: ratePool } = createTestDb(TEST_DATABASE_URL);
		limitedPool = ratePool;
		const { auth: limitedAuth, services: limitedServices } = createAuthServices(
			TEST_AUTH_CONFIG,
			limitedDb,
			[],
			{ emailSender: createFakeEmailSender() }
		);
		limitedApp = buildServer({
			auth: limitedAuth,
			authServices: limitedServices,
			db: limitedDb,
			logger: false,
			webOrigin: TEST_WEB_ORIGIN,
		});
		await limitedApp.ready();
	});

	afterAll(async () => {
		await limitedApp.close();
		await limitedPool.end();
	});

	it("throttles repeated login attempts from the same IP (max 5 per 10s)", async () => {
		const ATTEMPTS_OVER_LIMIT = 6;
		const statusCodes: number[] = [];

		for (let i = 0; i < ATTEMPTS_OVER_LIMIT; i += 1) {
			// Sequential on purpose: this simulates a real brute-force attempt and
			// must observe the limit tripping partway through.
			// biome-ignore lint/performance/noAwaitInLoops: sequential requests are the point of this test
			const response = await limitedApp.inject({
				method: "POST",
				payload: { email: "nobody@example.com", password: "wrong" },
				url: `${REST}/auth/login`,
			});
			statusCodes.push(response.statusCode);
		}

		expect(statusCodes).toContain(TOO_MANY_REQUESTS);
	});

	it("does not throttle a single request to an unrelated route", async () => {
		const response = await limitedApp.inject({ method: "GET", url: "/" });
		expect(response.statusCode).toBe(OK);
	});
});

describe("API documentation", () => {
	it("serves Better Auth's own OpenAPI reference at /api/auth/reference", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/api/auth/reference",
		});

		expect(response.statusCode).toBe(OK);
		expect(response.body).toContain("Better Auth");
	});

	it("serves the Swagger UI at /docs", async () => {
		const response = await app.inject({ method: "GET", url: "/docs/" });

		expect(response.statusCode).toBe(OK);
		expect(response.body).toContain("swagger");
	});

	it("serves the generated OpenAPI document listing every auth path", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/docs/json",
		});

		expect(response.statusCode).toBe(OK);
		expect(Object.keys(response.json().paths)).toEqual(
			expect.arrayContaining([
				"/auth/login",
				"/auth/logout",
				"/auth/me",
				"/auth/register",
				"/auth/request-password-reset",
				"/auth/reset-password",
			])
		);
	});
});

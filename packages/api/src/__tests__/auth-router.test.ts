import type { Session } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import {
	EmailAlreadyExistsError,
	InvalidCredentialsError,
	InvalidOrExpiredResetTokenError,
	WeakPasswordError,
} from "@hourino/auth/domain/errors";
import type { Database } from "@hourino/db";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

const SESSION_TTL_MS = 60 * 60 * 1000;

const fakeUser = {
	email: "ada@example.com",
	emailVerified: false,
	id: "user_1",
	image: null,
	name: "Ada Lovelace",
};

const fakeSession = {
	session: { expiresAt: new Date(Date.now() + SESSION_TTL_MS), id: "sess_1" },
	user: fakeUser,
} as unknown as Session;

type ServiceName = keyof AuthServices;

/** Every service is a `vi.fn()` resolving to `undefined` unless overridden. */
function createFakeServices(
	overrides: Partial<Record<ServiceName, () => Promise<unknown>>>
): AuthServices {
	const names: ServiceName[] = [
		"getSession",
		"login",
		"logout",
		"registerUser",
		"requestPasswordReset",
		"resetPassword",
	];

	const services: Record<string, { execute: unknown }> = {};
	for (const name of names) {
		const impl = overrides[name] ?? (() => Promise.resolve(undefined));
		services[name] = { execute: vi.fn(impl) };
	}

	return services as unknown as AuthServices;
}

interface FakeContextOptions {
	services?: Partial<Record<ServiceName, () => Promise<unknown>>>;
	session?: Session | null;
	webOrigin?: string;
}

function createFakeContext(options: FakeContextOptions = {}) {
	const setCookies = vi.fn<(values: readonly string[]) => void>();

	const ctx: Context = {
		authServices: createFakeServices(options.services ?? {}),
		cookies: { setCookies },
		db: {} as Database,
		requestHeaders: new Headers({ cookie: "better-auth.session_token=abc" }),
		session: options.session ?? null,
		webOrigin: options.webOrigin ?? "http://localhost:3001",
	};

	return { ctx, setCookies };
}

function caller(ctx: Context) {
	return appRouter.createCaller(ctx);
}

async function expectTrpcCode(
	promise: Promise<unknown>,
	code: TRPCError["code"]
) {
	const error = await promise.then(
		() => null,
		(caught: unknown) => caught
	);

	expect(error).toBeInstanceOf(TRPCError);
	expect((error as TRPCError).code).toBe(code);

	return error as TRPCError;
}

const successfulAuthResult = () =>
	Promise.resolve({
		cookies: ["better-auth.session_token=tok; Path=/; HttpOnly"],
		token: "tok",
		user: fakeUser,
	});

describe("auth.register", () => {
	it("maps EmailAlreadyExistsError to CONFLICT", async () => {
		const { ctx } = createFakeContext({
			services: {
				registerUser: () =>
					Promise.reject(new EmailAlreadyExistsError("User already exists.")),
			},
		});

		const error = await expectTrpcCode(
			caller(ctx).auth.register({
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "correct-horse",
			}),
			"CONFLICT"
		);
		expect(error.message).toBe("User already exists.");
	});

	it("maps WeakPasswordError to BAD_REQUEST", async () => {
		const { ctx } = createFakeContext({
			services: {
				registerUser: () => Promise.reject(new WeakPasswordError("Too weak.")),
			},
		});

		await expectTrpcCode(
			caller(ctx).auth.register({
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "correct-horse",
			}),
			"BAD_REQUEST"
		);
	});

	it("collapses unknown failures into INTERNAL_SERVER_ERROR", async () => {
		const { ctx } = createFakeContext({
			services: {
				registerUser: () =>
					Promise.reject(new Error("connect ECONNREFUSED 10.0.0.1:5432")),
			},
		});

		const error = await expectTrpcCode(
			caller(ctx).auth.register({
				email: "ada@example.com",
				name: "Ada Lovelace",
				password: "correct-horse",
			}),
			"INTERNAL_SERVER_ERROR"
		);
		expect(error.message).not.toContain("ECONNREFUSED");
	});

	it("forwards the session cookies on success", async () => {
		const { ctx, setCookies } = createFakeContext({
			services: { registerUser: successfulAuthResult },
		});

		const result = await caller(ctx).auth.register({
			email: "ada@example.com",
			name: "Ada Lovelace",
			password: "correct-horse",
		});

		expect(result).toEqual({ token: "tok", user: fakeUser });
		expect(setCookies).toHaveBeenCalledWith([
			"better-auth.session_token=tok; Path=/; HttpOnly",
		]);
	});

	it("rejects an invalid email before reaching the service", async () => {
		const { ctx } = createFakeContext({});

		await expectTrpcCode(
			caller(ctx).auth.register({
				email: "not-an-email",
				name: "Ada Lovelace",
				password: "correct-horse",
			}),
			"BAD_REQUEST"
		);
	});
});

describe("auth.login", () => {
	it("maps InvalidCredentialsError to UNAUTHORIZED", async () => {
		const { ctx } = createFakeContext({
			services: {
				login: () =>
					Promise.reject(
						new InvalidCredentialsError("Invalid email or password.")
					),
			},
		});

		await expectTrpcCode(
			caller(ctx).auth.login({
				email: "ada@example.com",
				password: "nope",
			}),
			"UNAUTHORIZED"
		);
	});

	it("forwards the session cookies on success", async () => {
		const { ctx, setCookies } = createFakeContext({
			services: { login: successfulAuthResult },
		});

		const result = await caller(ctx).auth.login({
			email: "ada@example.com",
			password: "correct-horse",
		});

		expect(result.token).toBe("tok");
		expect(setCookies).toHaveBeenCalledTimes(1);
	});
});

describe("auth.logout", () => {
	it("requires a session", async () => {
		const { ctx } = createFakeContext({ session: null });

		await expectTrpcCode(caller(ctx).auth.logout(), "UNAUTHORIZED");
	});

	it("forwards the cleared cookies", async () => {
		const { ctx, setCookies } = createFakeContext({
			services: {
				logout: () =>
					Promise.resolve({
						cookies: ["better-auth.session_token=; Max-Age=0"],
					}),
			},
			session: fakeSession,
		});

		await expect(caller(ctx).auth.logout()).resolves.toEqual({ success: true });
		expect(setCookies).toHaveBeenCalledWith([
			"better-auth.session_token=; Max-Age=0",
		]);
	});
});

describe("auth.me", () => {
	it("requires a session", async () => {
		const { ctx } = createFakeContext({ session: null });

		await expectTrpcCode(caller(ctx).auth.me(), "UNAUTHORIZED");
	});

	it("reads the already-resolved context session without calling the service", async () => {
		const getSession = vi.fn(() => Promise.resolve(null));
		const { ctx } = createFakeContext({
			services: { getSession },
			session: fakeSession,
		});

		const result = await caller(ctx).auth.me();

		expect(result.user).toEqual(fakeUser);
		expect(result.session.id).toBe("sess_1");
		expect(getSession).not.toHaveBeenCalled();
	});
});

describe("auth.requestPasswordReset", () => {
	it("builds the redirect URL from the context web origin", async () => {
		const execute = vi.fn(() => Promise.resolve());
		const { ctx } = createFakeContext({
			services: { requestPasswordReset: execute },
			webOrigin: "https://app.example.com",
		});

		await expect(
			caller(ctx).auth.requestPasswordReset({ email: "ada@example.com" })
		).resolves.toEqual({ success: true });
		expect(execute).toHaveBeenCalledWith({
			email: "ada@example.com",
			redirectTo: "https://app.example.com/reset-password",
		});
	});

	it("still reports success when the service throws (no enumeration)", async () => {
		const { ctx } = createFakeContext({
			services: {
				requestPasswordReset: () => Promise.reject(new Error("resend is down")),
			},
		});

		await expect(
			caller(ctx).auth.requestPasswordReset({ email: "ghost@example.com" })
		).resolves.toEqual({ success: true });
	});
});

describe("auth.resetPassword", () => {
	it("maps InvalidOrExpiredResetTokenError to BAD_REQUEST", async () => {
		const { ctx } = createFakeContext({
			services: {
				resetPassword: () =>
					Promise.reject(new InvalidOrExpiredResetTokenError("Bad token.")),
			},
		});

		await expectTrpcCode(
			caller(ctx).auth.resetPassword({
				newPassword: "correct-horse",
				token: "tok",
			}),
			"BAD_REQUEST"
		);
	});

	it("maps WeakPasswordError to BAD_REQUEST", async () => {
		const { ctx } = createFakeContext({
			services: {
				resetPassword: () => Promise.reject(new WeakPasswordError("Too weak.")),
			},
		});

		await expectTrpcCode(
			caller(ctx).auth.resetPassword({
				newPassword: "correct-horse",
				token: "tok",
			}),
			"BAD_REQUEST"
		);
	});

	it("returns success when the service resolves", async () => {
		const { ctx } = createFakeContext({
			services: { resetPassword: () => Promise.resolve() },
		});

		await expect(
			caller(ctx).auth.resetPassword({
				newPassword: "correct-horse",
				token: "tok",
			})
		).resolves.toEqual({ success: true });
	});
});

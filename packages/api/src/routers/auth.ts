import {
	EmailAlreadyExistsError,
	InvalidCredentialsError,
	InvalidOrExpiredResetTokenError,
	WeakPasswordError,
} from "@hourino/auth/domain/errors";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MIN_NAME_LENGTH = 2;

const userSchema = z.object({
	email: z.string(),
	emailVerified: z.boolean(),
	id: z.string(),
	image: z.string().nullable(),
	name: z.string(),
});

const authResultSchema = z.object({
	token: z.string().nullable(),
	user: userSchema,
});

const successSchema = z.object({ success: z.literal(true) });

/**
 * Forwards the real request headers (so Better Auth can capture the caller's
 * IP/user-agent on the new session) while stripping any incoming `cookie` —
 * these are public, unauthenticated endpoints, and a caller's pre-existing
 * session cookie should never influence a fresh register/login.
 */
function headersForAnonymousMutation(requestHeaders: Headers): Headers {
	const headers = new Headers(requestHeaders);
	headers.delete("cookie");
	return headers;
}

const registerInputSchema = z.object({
	email: z.email(),
	name: z.string().min(MIN_NAME_LENGTH),
	password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

const loginInputSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

const resetPasswordInputSchema = z.object({
	newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
	token: z.string().min(1),
});

/**
 * Translates a domain error raised by `@hourino/auth`'s application services
 * into the equivalent tRPC wire error. Anything unrecognised is deliberately
 * collapsed into `INTERNAL_SERVER_ERROR` so infrastructure detail never leaks.
 */
function mapAuthError(error: unknown): never {
	if (error instanceof EmailAlreadyExistsError) {
		throw new TRPCError({
			cause: error,
			code: "CONFLICT",
			message: error.message,
		});
	}

	if (error instanceof InvalidCredentialsError) {
		throw new TRPCError({
			cause: error,
			code: "UNAUTHORIZED",
			message: error.message,
		});
	}

	if (
		error instanceof WeakPasswordError ||
		error instanceof InvalidOrExpiredResetTokenError
	) {
		throw new TRPCError({
			cause: error,
			code: "BAD_REQUEST",
			message: error.message,
		});
	}

	throw new TRPCError({
		cause: error,
		code: "INTERNAL_SERVER_ERROR",
		message: "Unexpected authentication failure.",
	});
}

export const authRouter = router({
	login: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/auth/login",
				summary: "Sign in with email and password",
				tags: ["auth"],
			},
		})
		.input(loginInputSchema)
		.output(authResultSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await ctx.authServices.login.execute(
					input,
					headersForAnonymousMutation(ctx.requestHeaders)
				);
				ctx.cookies.setCookies(result.cookies);
				return { token: result.token, user: result.user };
			} catch (error) {
				return mapAuthError(error);
			}
		}),

	logout: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/auth/logout",
				protect: true,
				summary: "Sign out of the current session",
				tags: ["auth"],
			},
		})
		.input(z.void())
		.output(successSchema)
		.mutation(async ({ ctx }) => {
			try {
				const result = await ctx.authServices.logout.execute(
					ctx.requestHeaders
				);
				ctx.cookies.setCookies(result.cookies);
				return { success: true as const };
			} catch (error) {
				return mapAuthError(error);
			}
		}),

	me: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/auth/me",
				protect: true,
				summary: "Read the currently authenticated user",
				tags: ["auth"],
			},
		})
		.input(z.void())
		.output(
			z.object({
				session: z.object({ expiresAt: z.date(), id: z.string() }),
				user: userSchema,
			})
		)
		.query(({ ctx }) => {
			// `ctx.session` is already resolved once per request in createContext —
			// re-calling the service here would be a redundant second lookup.
			const { session, user } = ctx.session;

			return {
				session: { expiresAt: session.expiresAt, id: session.id },
				user: {
					email: user.email,
					emailVerified: user.emailVerified,
					id: user.id,
					image: user.image ?? null,
					name: user.name,
				},
			};
		}),

	register: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/auth/register",
				summary: "Create an account with email and password",
				tags: ["auth"],
			},
		})
		.input(registerInputSchema)
		.output(authResultSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await ctx.authServices.registerUser.execute(
					input,
					headersForAnonymousMutation(ctx.requestHeaders)
				);
				ctx.cookies.setCookies(result.cookies);
				return { token: result.token, user: result.user };
			} catch (error) {
				return mapAuthError(error);
			}
		}),

	requestPasswordReset: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/auth/request-password-reset",
				summary: "Send a password-reset email",
				tags: ["auth"],
			},
		})
		.input(z.object({ email: z.email() }))
		.output(successSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.authServices.requestPasswordReset.execute({
					email: input.email,
					redirectTo: `${ctx.webOrigin}/reset-password`,
				});
			} catch {
				// Deliberately swallowed: the response must be identical whether or
				// not the address belongs to an account (no account enumeration).
			}

			return { success: true as const };
		}),

	resetPassword: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/auth/reset-password",
				summary: "Complete a password reset using a emailed token",
				tags: ["auth"],
			},
		})
		.input(resetPasswordInputSchema)
		.output(successSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.authServices.resetPassword.execute(input);
				return { success: true as const };
			} catch (error) {
				return mapAuthError(error);
			}
		}),
});

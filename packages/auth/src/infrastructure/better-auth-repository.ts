import { isAPIError } from "better-auth/api";

import {
	type AuthDomainError,
	EmailAlreadyExistsError,
	InvalidCredentialsError,
	InvalidOrExpiredResetTokenError,
	UnknownAuthError,
	WeakPasswordError,
} from "../domain/errors";
import type {
	AuthMutationResult,
	AuthRepository,
	SignInInput,
	SignUpInput,
} from "../domain/ports/auth-repository";
import type { AuthSession, AuthUser } from "../domain/types";
import type { Auth } from "../index";

/**
 * Structural shape of Better Auth's user object — deliberately loose so this
 * mapper keeps working across Better Auth's additional/plugin user fields.
 */
interface BetterAuthUserLike {
	email: string;
	emailVerified: boolean;
	id: string;
	image?: string | null;
	name: string;
}

function toAuthUser(user: BetterAuthUserLike): AuthUser {
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		id: user.id,
		image: user.image ?? null,
		name: user.name,
	};
}

/**
 * Better Auth (`better-call`) exposes BOTH a string `status`
 * (e.g. `"UNPROCESSABLE_ENTITY"`) and a numeric `statusCode` (e.g. `422`),
 * plus a `body` carrying `{ code, message }` from `BASE_ERROR_CODES`.
 */
interface ApiErrorFacts {
	errorCode: string | undefined;
	message: string;
	statusCode: number | undefined;
}

function readApiErrorFacts(error: unknown): ApiErrorFacts | null {
	if (!isAPIError(error)) {
		return null;
	}

	const body: unknown = error.body;
	const rawCode =
		typeof body === "object" && body !== null && "code" in body
			? (body as { code: unknown }).code
			: undefined;

	return {
		errorCode: typeof rawCode === "string" ? rawCode : undefined,
		message: error.message ?? "",
		statusCode:
			typeof error.statusCode === "number" ? error.statusCode : undefined,
	};
}

const DUPLICATE_EMAIL_CODES = new Set([
	"USER_ALREADY_EXISTS",
	"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

const WEAK_PASSWORD_CODES = new Set([
	"INVALID_PASSWORD",
	"PASSWORD_TOO_LONG",
	"PASSWORD_TOO_SHORT",
]);

const ALREADY_EXISTS_PATTERN = /already exists/i;
const PASSWORD_PATTERN = /password/i;

/**
 * VERIFIED against Better Auth 1.7.5 running on Postgres (see
 * `apps/server/src/__tests__/auth-routes.integration.test.ts`). Observed shapes:
 *
 * | call                          | status                 | statusCode | body.code                            |
 * | ----------------------------- | ---------------------- | ---------- | ------------------------------------ |
 * | signUpEmail, duplicate email  | UNPROCESSABLE_ENTITY   | 422        | USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL |
 * | signUpEmail, short password   | BAD_REQUEST            | 400        | PASSWORD_TOO_SHORT                   |
 * | signInEmail, wrong password   | UNAUTHORIZED           | 401        | INVALID_EMAIL_OR_PASSWORD            |
 * | signInEmail, unknown email    | UNAUTHORIZED           | 401        | INVALID_EMAIL_OR_PASSWORD            |
 * | resetPassword, bad/used token | BAD_REQUEST            | 400        | INVALID_TOKEN                        |
 * | resetPassword, short password | BAD_REQUEST            | 400        | PASSWORD_TOO_SHORT                   |
 *
 * The status/message fallbacks below remain as a safety net for Better Auth
 * releases that rename a code.
 */
function mapSignUpError(error: unknown): AuthDomainError {
	const facts = readApiErrorFacts(error);

	if (facts) {
		const isDuplicate =
			(facts.errorCode !== undefined &&
				DUPLICATE_EMAIL_CODES.has(facts.errorCode)) ||
			facts.statusCode === 422 ||
			ALREADY_EXISTS_PATTERN.test(facts.message);
		if (isDuplicate) {
			return new EmailAlreadyExistsError(
				facts.message || "An account with this email already exists.",
				{ cause: error }
			);
		}

		const isWeakPassword =
			(facts.errorCode !== undefined &&
				WEAK_PASSWORD_CODES.has(facts.errorCode)) ||
			(facts.statusCode === 400 && PASSWORD_PATTERN.test(facts.message));
		if (isWeakPassword) {
			return new WeakPasswordError(
				facts.message || "The provided password is not acceptable.",
				{ cause: error }
			);
		}
	}

	return new UnknownAuthError(
		error instanceof Error ? error.message : "Unknown sign-up failure.",
		{ cause: error }
	);
}

/**
 * `resetPassword` fails for two genuinely different reasons — a bad/expired/
 * already-used token (`INVALID_TOKEN`) and a password the policy rejects
 * (`PASSWORD_TOO_SHORT`) — and both arrive as a plain 400. Collapsing them
 * would show "this link has expired" to someone who merely typed a short
 * password, so they are separated on `body.code`.
 */
function mapResetPasswordError(error: unknown): AuthDomainError {
	const facts = readApiErrorFacts(error);

	if (facts) {
		const isWeakPassword =
			(facts.errorCode !== undefined &&
				WEAK_PASSWORD_CODES.has(facts.errorCode)) ||
			(facts.statusCode === 400 && PASSWORD_PATTERN.test(facts.message));

		if (isWeakPassword) {
			return new WeakPasswordError(
				facts.message || "The provided password is not acceptable.",
				{ cause: error }
			);
		}
	}

	return new InvalidOrExpiredResetTokenError(
		facts?.message || "This password reset link is invalid or has expired.",
		{ cause: error }
	);
}

export class BetterAuthRepository implements AuthRepository {
	private readonly auth: Pick<Auth, "api">;

	constructor(auth: Pick<Auth, "api">) {
		this.auth = auth;
	}

	async signUp(
		input: SignUpInput,
		headers: Headers
	): Promise<AuthMutationResult> {
		try {
			const { headers: responseHeaders, response } =
				await this.auth.api.signUpEmail({
					body: {
						email: input.email,
						name: input.name,
						password: input.password,
					},
					headers,
					returnHeaders: true,
				});

			return {
				cookies: responseHeaders.getSetCookie(),
				token: response.token ?? null,
				user: toAuthUser(response.user),
			};
		} catch (error) {
			throw mapSignUpError(error);
		}
	}

	async signIn(
		input: SignInInput,
		headers: Headers
	): Promise<AuthMutationResult> {
		try {
			const { headers: responseHeaders, response } =
				await this.auth.api.signInEmail({
					body: { email: input.email, password: input.password },
					headers,
					returnHeaders: true,
				});

			return {
				cookies: responseHeaders.getSetCookie(),
				token: response.token ?? null,
				user: toAuthUser(response.user),
			};
		} catch (error) {
			// Deliberately collapsed: never leak whether the email exists.
			throw new InvalidCredentialsError(
				isAPIError(error) ? error.message : "Invalid email or password.",
				{ cause: error }
			);
		}
	}

	async signOut(headers: Headers): Promise<{ cookies: string[] }> {
		const { headers: responseHeaders } = await this.auth.api.signOut({
			headers,
			returnHeaders: true,
		});

		return { cookies: responseHeaders.getSetCookie() };
	}

	async getSession(
		headers: Headers
	): Promise<{ user: AuthUser; session: AuthSession } | null> {
		const result = await this.auth.api.getSession({ headers });

		if (!result) {
			return null;
		}

		return {
			session: {
				expiresAt: result.session.expiresAt,
				id: result.session.id,
			},
			user: toAuthUser(result.user),
		};
	}

	async requestPasswordReset(input: {
		email: string;
		redirectTo: string;
	}): Promise<void> {
		// Intentionally does not distinguish "unknown email" — Better Auth
		// already returns a neutral response to avoid account enumeration.
		await this.auth.api.requestPasswordReset({
			body: { email: input.email, redirectTo: input.redirectTo },
		});
	}

	async resetPassword(input: {
		token: string;
		newPassword: string;
	}): Promise<void> {
		try {
			await this.auth.api.resetPassword({
				body: { newPassword: input.newPassword, token: input.token },
			});
		} catch (error) {
			throw mapResetPasswordError(error);
		}
	}
}

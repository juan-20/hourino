import {
	EmailAlreadyExistsError,
	InvalidCredentialsError,
	InvalidOrExpiredResetTokenError,
	WeakPasswordError,
} from "../../domain/errors";
import type {
	AuthMutationResult,
	AuthRepository,
	SignInInput,
	SignUpInput,
} from "../../domain/ports/auth-repository";
import type { AuthSession, AuthUser } from "../../domain/types";

export const FAKE_SESSION_COOKIE = "fake_session";

const MIN_PASSWORD_LENGTH = 8;
const SESSION_TTL_MS = 60 * 60 * 1000;

interface StoredUser {
	email: string;
	emailVerified: boolean;
	id: string;
	image: string | null;
	name: string;
	password: string;
}

function toAuthUser(user: StoredUser): AuthUser {
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		id: user.id,
		image: user.image,
		name: user.name,
	};
}

function readSessionToken(headers: Headers): string | null {
	const cookieHeader = headers.get("cookie");
	if (!cookieHeader) {
		return null;
	}

	for (const part of cookieHeader.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === FAKE_SESSION_COOKIE) {
			return rest.join("=") || null;
		}
	}

	return null;
}

/**
 * In-memory `AuthRepository` with real behaviour (duplicate detection,
 * password checks, session + reset-token lifecycles) so application-layer
 * tests exercise something meaningful rather than a no-op stub.
 */
export class FakeAuthRepository implements AuthRepository {
	private readonly usersByEmail = new Map<string, StoredUser>();
	private readonly sessionsByToken = new Map<
		string,
		AuthSession & {
			userId: string;
		}
	>();
	private readonly resetTokensByToken = new Map<string, string>();
	private counter = 0;

	signUp(input: SignUpInput, _headers: Headers): Promise<AuthMutationResult> {
		const email = input.email.toLowerCase();

		if (this.usersByEmail.has(email)) {
			return Promise.reject(
				new EmailAlreadyExistsError("User already exists. Use another email.")
			);
		}

		if (input.password.length < MIN_PASSWORD_LENGTH) {
			return Promise.reject(new WeakPasswordError("Password too short"));
		}

		this.counter += 1;
		const user: StoredUser = {
			email,
			emailVerified: false,
			id: `user_${this.counter}`,
			image: null,
			name: input.name,
			password: input.password,
		};
		this.usersByEmail.set(email, user);

		return Promise.resolve(this.startSession(user));
	}

	signIn(input: SignInInput, _headers: Headers): Promise<AuthMutationResult> {
		const user = this.usersByEmail.get(input.email.toLowerCase());

		if (!user || user.password !== input.password) {
			return Promise.reject(
				new InvalidCredentialsError("Invalid email or password.")
			);
		}

		return Promise.resolve(this.startSession(user));
	}

	signOut(headers: Headers): Promise<{ cookies: string[] }> {
		const token = readSessionToken(headers);
		if (token) {
			this.sessionsByToken.delete(token);
		}

		return Promise.resolve({
			cookies: [`${FAKE_SESSION_COOKIE}=; Path=/; Max-Age=0`],
		});
	}

	getSession(
		headers: Headers
	): Promise<{ user: AuthUser; session: AuthSession } | null> {
		const token = readSessionToken(headers);
		if (!token) {
			return Promise.resolve(null);
		}

		const session = this.sessionsByToken.get(token);
		if (!session) {
			return Promise.resolve(null);
		}

		const user = this.findUserById(session.userId);
		if (!user) {
			return Promise.resolve(null);
		}

		return Promise.resolve({
			session: { expiresAt: session.expiresAt, id: session.id },
			user: toAuthUser(user),
		});
	}

	requestPasswordReset(input: {
		email: string;
		redirectTo: string;
	}): Promise<void> {
		const user = this.usersByEmail.get(input.email.toLowerCase());

		// Neutral response for unknown emails — no account enumeration.
		if (user) {
			this.counter += 1;
			this.resetTokensByToken.set(`reset_${this.counter}`, user.id);
		}

		return Promise.resolve();
	}

	resetPassword(input: { token: string; newPassword: string }): Promise<void> {
		const userId = this.resetTokensByToken.get(input.token);
		if (!userId) {
			return Promise.reject(
				new InvalidOrExpiredResetTokenError("Invalid token")
			);
		}

		if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
			return Promise.reject(new WeakPasswordError("Password too short"));
		}

		const user = this.findUserById(userId);
		if (!user) {
			return Promise.reject(
				new InvalidOrExpiredResetTokenError("Invalid token")
			);
		}

		user.password = input.newPassword;
		this.resetTokensByToken.delete(input.token);

		return Promise.resolve();
	}

	/** Test helper: the most recently issued password-reset token. */
	lastResetToken(): string | undefined {
		return [...this.resetTokensByToken.keys()].at(-1);
	}

	/** Test helper: build a request `Headers` carrying the given session token. */
	static headersWithSession(token: string): Headers {
		return new Headers({ cookie: `${FAKE_SESSION_COOKIE}=${token}` });
	}

	private startSession(user: StoredUser): AuthMutationResult {
		this.counter += 1;
		const token = `token_${this.counter}`;
		const session = {
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
			id: `session_${this.counter}`,
			userId: user.id,
		};
		this.sessionsByToken.set(token, session);

		return {
			cookies: [`${FAKE_SESSION_COOKIE}=${token}; Path=/; HttpOnly`],
			token,
			user: toAuthUser(user),
		};
	}

	private findUserById(id: string): StoredUser | undefined {
		for (const user of this.usersByEmail.values()) {
			if (user.id === id) {
				return user;
			}
		}

		return undefined;
	}
}

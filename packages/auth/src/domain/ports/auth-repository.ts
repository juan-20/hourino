import type { AuthSession, AuthUser } from "../types";

export interface SignUpInput {
	email: string;
	name: string;
	password: string;
}

export interface SignInInput {
	email: string;
	password: string;
}

export interface AuthMutationResult {
	/** Raw `Set-Cookie` header values the caller must forward to the client. */
	cookies: string[];
	token: string | null;
	user: AuthUser;
}

export interface AuthRepository {
	getSession: (
		headers: Headers
	) => Promise<{ user: AuthUser; session: AuthSession } | null>;
	requestPasswordReset: (input: {
		email: string;
		redirectTo: string;
	}) => Promise<void>;
	resetPassword: (input: {
		token: string;
		newPassword: string;
	}) => Promise<void>;
	signIn: (input: SignInInput, headers: Headers) => Promise<AuthMutationResult>;
	signOut: (headers: Headers) => Promise<{ cookies: string[] }>;
	signUp: (input: SignUpInput, headers: Headers) => Promise<AuthMutationResult>;
}

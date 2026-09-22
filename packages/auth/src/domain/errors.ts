/**
 * Domain-level authentication errors.
 *
 * These are transport-agnostic: the infrastructure layer translates whatever
 * Better Auth throws into one of these, and the controller layer (tRPC) maps
 * them onto wire-level error codes.
 */
export abstract class AuthDomainError extends Error {
	abstract readonly code: string;
}

export class EmailAlreadyExistsError extends AuthDomainError {
	readonly code = "EMAIL_ALREADY_EXISTS";
}

export class InvalidCredentialsError extends AuthDomainError {
	readonly code = "INVALID_CREDENTIALS";
}

export class WeakPasswordError extends AuthDomainError {
	readonly code = "WEAK_PASSWORD";
}

export class InvalidOrExpiredResetTokenError extends AuthDomainError {
	readonly code = "INVALID_RESET_TOKEN";
}

export class UnknownAuthError extends AuthDomainError {
	readonly code = "UNKNOWN_AUTH_ERROR";
}

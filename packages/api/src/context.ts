import type { Session } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import type { Database } from "@hourino/db";

/**
 * Transport-agnostic sink for `Set-Cookie` values produced by the auth
 * services. The HTTP adapter (Fastify, in `apps/server`) supplies the real
 * implementation; tests supply a recording fake.
 */
export interface CookieWriter {
	setCookies: (values: readonly string[]) => void;
}

export interface Context {
	authServices: AuthServices;
	cookies: CookieWriter;
	db: Database;
	/** Incoming request headers, resolved once per request. */
	requestHeaders: Headers;
	session: Session | null;
	/** Origin of the web client, used to build absolute callback URLs. */
	webOrigin: string;
}

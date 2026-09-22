import type { Context as ApiContext } from "@hourino/api/context";
import type { Auth } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import type { Database } from "@hourino/db";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { fromNodeHeaders } from "better-auth/node";

import { ENV } from "./env.server";
import { auth, authServices, db } from "./services";

export interface ContextDeps {
	auth: Auth;
	authServices: AuthServices;
	db: Database;
	/** Origin of the web client; used to build absolute callback URLs. */
	webOrigin: string;
}

/**
 * Builds the per-request tRPC context factory from an explicit set of
 * dependencies, so integration tests can point the whole request pipeline at a
 * throwaway database and a fake email sender.
 */
export function createContextFactory(deps: ContextDeps) {
	return async function createRequestContext({
		req,
		res,
	}: CreateFastifyContextOptions): Promise<ApiContext> {
		const requestHeaders = fromNodeHeaders(req.headers);
		const session = await deps.auth.api.getSession({ headers: requestHeaders });

		return {
			authServices: deps.authServices,
			cookies: {
				setCookies(values) {
					if (values.length > 0) {
						res.header("set-cookie", [...values]);
					}
				},
			},
			db: deps.db,
			requestHeaders,
			session,
			webOrigin: deps.webOrigin,
		};
	};
}

/** The production context factory, wired to `./services`. */
export const createContext = createContextFactory({
	auth,
	authServices,
	db,
	webOrigin: ENV.CORS_ORIGIN,
});

export type Context = ApiContext;

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { type AppRouter, appRouter } from "@hourino/api/routers/index";
import type { Auth } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import type { Database } from "@hourino/db";
import {
	type FastifyTRPCPluginOptions,
	fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import { initLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import Fastify, {
	type FastifyInstance,
	type FastifyServerOptions,
} from "fastify";
import {
	fastifyTRPCOpenApiPlugin,
	generateOpenApiDocument,
} from "trpc-to-openapi";

import { createContextFactory } from "./context";
import { ENV } from "./env.server";
import {
	auth as defaultAuth,
	authServices as defaultAuthServices,
	db as defaultDb,
} from "./services";

/**
 * REST mirror of the tRPC router. Deliberately NOT under `/api/auth/*`, which
 * is already a catch-all owned by Better Auth's own handler.
 */
const REST_BASE_PATH = "/api/rest";

const INTERNAL_SERVER_ERROR = 500;
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * `auth.api.*` calls (used by `BetterAuthRepository`) bypass Better Auth's own
 * rate limiter entirely — per Better Auth's docs, it only covers requests that
 * go through `auth.handler()` (i.e. the raw `/api/auth/*` passthrough this
 * frontend actually uses). These sensitive routes on the custom tRPC/REST
 * mirror therefore need their own explicit throttling; everything else keeps
 * the generous default below. `requestPasswordReset` gets the strictest limit
 * since it always reports success and would otherwise allow unbounded
 * email-bombing of any address.
 */
type SensitiveAuthRoute =
	| "login"
	| "register"
	| "requestPasswordReset"
	| "resetPassword";

const SENSITIVE_AUTH_ROUTE_LIMITS: Record<
	SensitiveAuthRoute,
	{ max: number; timeWindowMs: number }
> = {
	login: { max: 5, timeWindowMs: 10 * SECOND_MS },
	register: { max: 5, timeWindowMs: 10 * SECOND_MS },
	requestPasswordReset: { max: 3, timeWindowMs: HOUR_MS },
	resetPassword: { max: 10, timeWindowMs: 10 * MINUTE_MS },
};

const DEFAULT_RATE_LIMIT = { max: 300, timeWindowMs: MINUTE_MS };

/** Matches both transports (`/trpc/auth.login` and `/api/rest/auth/login`) to the same bucket. */
function matchSensitiveAuthRoute(url: string): SensitiveAuthRoute | null {
	if (url.includes("auth.login") || url.includes("auth/login")) {
		return "login";
	}
	if (url.includes("auth.register") || url.includes("auth/register")) {
		return "register";
	}
	if (
		url.includes("auth.requestPasswordReset") ||
		url.includes("auth/request-password-reset")
	) {
		return "requestPasswordReset";
	}
	if (
		url.includes("auth.resetPassword") ||
		url.includes("auth/reset-password")
	) {
		return "resetPassword";
	}
	return null;
}

initLogger({
	env: { service: "hourino-server" },
});

/** Same "no `node_modules` alongside a single-file `bun build` bundle" signal
 * `env.server.ts` uses for its varlock-binary check — walks up from `startDir`
 * looking for any `node_modules` directory. */
function isBundledDeploy(startDir: string): boolean {
	let currentDir = startDir;
	for (;;) {
		if (existsSync(join(currentDir, "node_modules"))) {
			return false;
		}
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return true;
		}
		currentDir = parentDir;
	}
}

export interface ServerDeps {
	auth?: Auth;
	authServices?: AuthServices;
	db?: Database;
	/** Pass `false` to silence Fastify's request logger (used by tests). */
	logger?: FastifyServerOptions["logger"];
	/** Pass `false` to skip rate limiting entirely (used by functional tests
	 * that call the sensitive auth routes many times in quick succession from
	 * a single injected "IP"; a dedicated test exercises the real thing). */
	rateLimit?: boolean;
	webOrigin?: string;
}

/**
 * Builds the fully-wired Fastify instance without binding a port, so tests can
 * drive it through `fastify.inject()`. `index.ts` is the only caller that
 * actually listens.
 */
export function buildServer(deps: ServerDeps = {}): FastifyInstance {
	const auth = deps.auth ?? defaultAuth;
	const authServices = deps.authServices ?? defaultAuthServices;
	const db = deps.db ?? defaultDb;
	const webOrigin = deps.webOrigin ?? ENV.CORS_ORIGIN;

	const createContext = createContextFactory({
		auth,
		authServices,
		db,
		webOrigin,
	});

	const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
		exclude: ["/api/auth/**"],
		maskEmail: true,
	});

	const fastify = Fastify({
		logger: deps.logger ?? true,
	});

	fastify.register(evlog, { drain: createAxiomDrain() });
	fastify.addHook("preHandler", async (request) => {
		await identifyUser(useLogger(), request.headers, request.url);
	});
	fastify.register(fastifyCors, {
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		credentials: true,
		maxAge: 86_400,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		origin: webOrigin,
	});

	// NOTE: keyed on `request.ip`, which is the raw socket address unless
	// Fastify's `trustProxy` is configured — if this server ends up behind a
	// reverse proxy/load balancer in production, `trustProxy` must be set (to
	// a specific trusted hop, never blindly `true`) or every client will be
	// bucketed together under the proxy's IP.
	if (deps.rateLimit !== false) {
		fastify.register(fastifyRateLimit, {
			keyGenerator: (request) =>
				`${request.ip}:${matchSensitiveAuthRoute(request.url) ?? "default"}`,
			max: (request) => {
				const route = matchSensitiveAuthRoute(request.url);
				return route
					? SENSITIVE_AUTH_ROUTE_LIMITS[route].max
					: DEFAULT_RATE_LIMIT.max;
			},
			timeWindow: (request) => {
				const route = matchSensitiveAuthRoute(request.url);
				return route
					? SENSITIVE_AUTH_ROUTE_LIMITS[route].timeWindowMs
					: DEFAULT_RATE_LIMIT.timeWindowMs;
			},
		});
	}

	fastify.route({
		async handler(request, reply) {
			try {
				const url = new URL(request.url, `http://${request.headers.host}`);
				const headers = new Headers();
				for (const [key, value] of Object.entries(request.headers)) {
					if (value) {
						headers.append(key, value.toString());
					}
				}
				const req = new Request(url.toString(), {
					body: request.body ? JSON.stringify(request.body) : undefined,
					headers,
					method: request.method,
				});
				const response = await auth.handler(req);
				reply.status(response.status);
				for (const [key, value] of response.headers.entries()) {
					reply.header(key, value);
				}
				if (response.status >= INTERNAL_SERVER_ERROR) {
					// Better Auth plugins (e.g. the Polar hook) can throw an APIError
					// whose message embeds a raw third-party error body — never forward
					// that to the client. Log the real cause server-side and return a
					// generic message instead.
					const rawBody = response.body ? await response.text() : null;
					fastify.log.error(
						{ body: rawBody, status: response.status },
						"Better Auth internal error — response sanitized before returning to client"
					);
					reply.header("content-type", "application/json; charset=utf-8");
					reply.send({
						code: "INTERNAL_SERVER_ERROR",
						message: "Something went wrong. Please try again.",
					});
					return;
				}
				reply.send(response.body ? await response.text() : null);
			} catch (error) {
				fastify.log.error({ err: error }, "Authentication Error:");
				reply.status(INTERNAL_SERVER_ERROR).send({
					code: "AUTH_FAILURE",
					error: "Internal authentication error",
				});
			}
		},
		method: ["GET", "POST"],
		url: "/api/auth/*",
	});

	fastify.register(fastifyTRPCPlugin, {
		prefix: "/trpc",
		trpcOptions: {
			createContext,
			onError({ path, error }) {
				fastify.log.error({ err: error, path }, "tRPC handler error");
			},
			router: appRouter,
		} satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
	});

	fastify.register(fastifyTRPCOpenApiPlugin, {
		basePath: REST_BASE_PATH,
		createContext,
		router: appRouter,
	});

	fastify.register(fastifySwagger, {
		mode: "static",
		specification: { document: buildOpenApiDocument() as never },
	});
	// @fastify/swagger-ui serves its logo and swagger-ui-dist JS/CSS by reading
	// files from its own package directory via `__dirname`-relative paths. On
	// the single-file `bun build` bundle Prisma Compute deploys (no
	// `node_modules` alongside it), those paths don't resolve to real files —
	// the plugin throws on register (ENOENT for the logo; "root must be an
	// absolute path" for its static-asset server), crash-looping the whole
	// process before it can bind a port. It only works where `node_modules`
	// is actually present, i.e. everywhere except that bundled deploy.
	if (isBundledDeploy(process.cwd())) {
		fastify.log.warn(
			"Skipping @fastify/swagger-ui: running from a bundled deploy with no node_modules, and the plugin reads its assets from disk."
		);
	} else {
		fastify.register(fastifySwaggerUi, { routePrefix: "/docs" });
	}

	fastify.get("/", () => "OK");

	return fastify;
}

/** The OpenAPI 3.1 document describing the REST mirror at `/api/rest`. */
export function buildOpenApiDocument() {
	return generateOpenApiDocument(appRouter, {
		baseUrl: `${ENV.BETTER_AUTH_URL}${REST_BASE_PATH}`,
		description: "REST mirror of the Hourino tRPC API.",
		title: "Hourino API",
		version: "0.1.0",
	});
}

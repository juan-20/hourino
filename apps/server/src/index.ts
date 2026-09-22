import "./database-url"; // must stay the first import — see file for why

import fastifyCors from "@fastify/cors";
import { type AppRouter, appRouter } from "@hourino/api/routers/index";
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
import Fastify from "fastify";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { auth } from "./services";

const baseCorsConfig = {
	allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	credentials: true,
	maxAge: 86_400,
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	origin: ENV.CORS_ORIGIN,
};

initLogger({
	env: { service: "hourino-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: ["/api/auth/**"],
	maskEmail: true,
});

const fastify = Fastify({
	logger: true,
});

fastify.register(evlog, { drain: createAxiomDrain() });
fastify.addHook("preHandler", async (request) => {
	await identifyUser(useLogger(), request.headers, request.url);
});
fastify.register(fastifyCors, baseCorsConfig);

fastify.route({
	async handler(request, reply) {
		try {
			const url = new URL(request.url, `http://${request.headers.host}`);
			const headers = new Headers();
			Object.entries(request.headers).forEach(([key, value]) => {
				if (value) {
					headers.append(key, value.toString());
				}
			});
			const req = new Request(url.toString(), {
				body: request.body ? JSON.stringify(request.body) : undefined,
				headers,
				method: request.method,
			});
			const response = await auth.handler(req);
			reply.status(response.status);
			response.headers.forEach((value, key) => reply.header(key, value));
			reply.send(response.body ? await response.text() : null);
		} catch (error) {
			fastify.log.error({ err: error }, "Authentication Error:");
			reply.status(500).send({
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
			console.error(`Error in tRPC handler on path '${path}':`, error);
		},
		router: appRouter,
	} satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

fastify.get("/", async () => "OK");

fastify.listen({ host: "0.0.0.0", port: 3000 }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	console.log("Server running on port 3000");
});

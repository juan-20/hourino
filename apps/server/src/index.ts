import fastifyCors from "@fastify/cors";
import { appRouter, type AppRouter } from "@hourino/api/routers/index";
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { initLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import Fastify from "fastify";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { auth } from "./services";

const baseCorsConfig = {
  origin: ENV.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
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
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      fastify.log.error({ err: error }, "Authentication Error:");
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

fastify.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

fastify.get("/", async () => {
  return "OK";
});

fastify.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log("Server running on port 3000");
});

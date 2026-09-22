import "./database-url"; // must stay the first import — see file for why

import { buildServer } from "./server";

const DEFAULT_PORT = 3000;
// Prisma Compute injects PORT at runtime and requires the app to bind to it —
// the declared `port` in alchemy.run.ts's Prisma.Compute config does not
// guarantee the container's actual assigned port matches a hardcoded value.
// Local dev (no PORT set) falls back to the same default used elsewhere
// (alchemy.run.ts's `port: 3000`, apps/server/.env.local's BETTER_AUTH_URL).
const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;

const fastify = buildServer();

fastify.listen({ host: "0.0.0.0", port }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info(`Server running on port ${port}`);
});

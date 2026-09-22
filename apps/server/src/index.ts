import "./database-url"; // must stay the first import — see file for why

import { buildServer } from "./server";

const fastify = buildServer();

fastify.listen({ host: "0.0.0.0", port: 3000 }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	fastify.log.info("Server running on port 3000");
});

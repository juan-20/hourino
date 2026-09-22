import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

// Local dev lane routes through a local Neon-HTTP-protocol proxy
// (docker-compose.yml's `neon-proxy` service) since the Neon serverless
// driver speaks Neon's HTTP proxy protocol, not raw Postgres wire protocol,
// and can't reach a plain local Postgres container directly. The cloud lane
// (Alchemy-provisioned Neon) is unaffected — this only special-cases the
// local proxy hostname and otherwise falls back to Neon's default behavior.
neonConfig.fetchEndpoint = (host) =>
	host === "db.localtest.me"
		? `http://${host}:4444/sql`
		: `https://${host}/sql`;

export function createDb(env: DatabaseConfig) {
	const sql = neon(env.DATABASE_URL);
	return drizzle({ client: sql, relations });
}

export type Database = ReturnType<typeof createDb>;

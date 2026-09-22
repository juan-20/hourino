import type { Database } from "@hourino/db";
import { relations } from "@hourino/db/relations";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The production `createDb()` uses Neon's HTTP driver, which cannot talk to a
 * plain local Postgres (it speaks Neon's `/sql` HTTP protocol, not the wire
 * protocol). Tests therefore build a structurally identical Drizzle instance
 * over `node-postgres` against the docker-compose Postgres and hand it to
 * `buildServer({ db })`. Everything above the driver — Better Auth's Drizzle
 * adapter, the repository, the services, the router — is the real thing.
 */
export function createTestDb(connectionString: string) {
	const pool = new Pool({ connectionString, max: 4 });
	const db = drizzle({ client: pool, relations });

	return { db: db as unknown as Database, pool };
}

const AUTH_TABLES = ["user", "session", "account", "verification"] as const;

/** Neon's HTTP driver has no per-test transaction rollback, so tests reset
 * state by truncating Better Auth's tables between cases. */
export async function truncateAuthTables(pool: Pool): Promise<void> {
	const list = AUTH_TABLES.map((table) => `"${table}"`).join(", ");
	await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { ADMIN_DATABASE_URL, TEST_DATABASE_URL } from "./helpers/test-env";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PACKAGE_DIR = path.resolve(HERE, "../../../../packages/db");

const TEST_DATABASE_NAME = new URL(TEST_DATABASE_URL).pathname.replace("/", "");

/**
 * Equivalent to:
 *   docker exec hourino-postgres psql -U hourino -d hourino_dev \
 *     -c "CREATE DATABASE hourino_test"
 * but done over the published port so tests do not require the docker CLI.
 */
async function ensureTestDatabase(): Promise<void> {
	const client = new Client({ connectionString: ADMIN_DATABASE_URL });
	await client.connect();

	try {
		const { rowCount } = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[TEST_DATABASE_NAME]
		);

		if (rowCount === 0) {
			// Identifier cannot be parameterised; the name is a local constant.
			await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
		}
	} finally {
		await client.end();
	}
}

/**
 * Applies the checked-in folder-based migrations from `packages/db/src/migrations`.
 * Shelling out to drizzle-kit (rather than drizzle-orm's runtime migrator) is
 * deliberate: drizzle-kit 1.0.0-rc.4's folder format has no `meta/_journal.json`
 * for the runtime migrator to read.
 */
function applyMigrations(): void {
	execSync("bun x drizzle-kit migrate", {
		cwd: DB_PACKAGE_DIR,
		env: {
			...process.env,
			DATABASE_URL: TEST_DATABASE_URL,
			NODE_ENV: "development",
		},
		stdio: "pipe",
	});
}

export default async function setup(): Promise<void> {
	try {
		await ensureTestDatabase();
	} catch (error) {
		throw new Error(
			`Could not reach the local Postgres at ${ADMIN_DATABASE_URL}. Run \`bun run docker:up\` first.`,
			{ cause: error }
		);
	}

	applyMigrations();
}

import "varlock/auto-load";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("[guard-db-push] DATABASE_URL is not set. Aborting.");
	process.exit(1);
}

let hostname = "";
try {
	({ hostname } = new URL(url));
} catch {
	console.error("[guard-db-push] DATABASE_URL is not a valid URL. Aborting.");
	process.exit(1);
}

const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
const looksProd = process.env.NODE_ENV === "production" || !isLocalHost;
const force = process.env.DB_PUSH_FORCE === "1";

if (looksProd && !force) {
	console.error(
		`[guard-db-push] Refusing to run "drizzle-kit push" against "${hostname}" (NODE_ENV=${process.env.NODE_ENV ?? "unset"}).\n` +
			'db:push is for local iteration only (docker-compose Postgres). For real environments, use "bun run db:generate" + "bun run db:migrate" with checked-in migrations.\n' +
			"If this is genuinely intentional, re-run with DB_PUSH_FORCE=1."
	);
	process.exit(1);
}

console.log(
	`[guard-db-push] DATABASE_URL host "${hostname}" looks local — proceeding.`
);

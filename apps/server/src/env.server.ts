import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CoercedEnvSchema } from "./env";

/**
 * Replicates varlock's own `findVarlockBin` search (walk up from a starting
 * directory looking for `node_modules/.bin/varlock`). This MUST run before
 * ever importing `varlock/auto-load` — when the binary is missing, its
 * internal `execSyncVarlock` helper calls `process.exit()` directly on
 * failure (confirmed by reading its source), which no try/catch, at any call
 * depth or import style (dynamic `import()`, `require`, sync or async), can
 * intercept. Skipping the import entirely is the only way to avoid the
 * process being killed when running as a single `bun build` bundle with no
 * node_modules alongside it (Alchemy's Prisma Compute deploy).
 */
function varlockBinaryExists(startDir: string): boolean {
	const binNames =
		process.platform === "win32" ? ["varlock.exe", "varlock.cmd"] : ["varlock"];
	let currentDir = startDir;
	for (;;) {
		const binDir = join(currentDir, "node_modules", ".bin");
		if (
			existsSync(binDir) &&
			binNames.some((name) => existsSync(join(binDir, name)))
		) {
			return true;
		}
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return false;
		}
		currentDir = parentDir;
	}
}

let resolvedEnv: Readonly<CoercedEnvSchema>;

if (varlockBinaryExists(process.cwd())) {
	await import("varlock/auto-load");
	({ ENV: resolvedEnv } = await import("./env"));
} else {
	// Deployed as a single `bun build` bundle with no node_modules alongside
	// it. Every value is already present as a real process.env var regardless
	// (Alchemy injects them directly via Prisma.Compute's `env` config), so
	// fall back to reading process.env as-is, skipping Varlock's schema
	// validation (which requires its CLI, unavailable here).
	resolvedEnv = process.env as unknown as Readonly<CoercedEnvSchema>;
}

export const ENV = resolvedEnv;

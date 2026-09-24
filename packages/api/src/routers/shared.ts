import type { Database } from "@hourino/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const successSchema = z.object({ success: z.literal(true) });

const MIN_YEAR = 2000;
const MAX_YEAR = 2099;

/**
 * Local calendar day, `YYYY-MM-DD`. Bounded to a sane range because every
 * distinct month written creates a physical time_entries partition.
 */
export const isoDateSchema = z.iso.date().refine((value) => {
	const year = Number(value.slice(0, 4));
	return year >= MIN_YEAR && year <= MAX_YEAR;
}, `Date must be between ${MIN_YEAR} and ${MAX_YEAR}`);

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

/**
 * Query-string arrays arrive as a bare string when only one value is sent
 * (`?categoryIds=a`) and as an array when repeated — normalize to an array.
 * tRPC clients already send real arrays, which pass through untouched.
 */
export function queryArray<T extends z.ZodType>(item: T, max: number) {
	return z.preprocess(
		(value) => (value === undefined || Array.isArray(value) ? value : [value]),
		z.array(item).max(max)
	);
}

/** Escapes `%`, `_` and `\` so user input is matched literally by ILIKE. */
export function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const PG_UNIQUE_VIOLATION = "23505";

/** Drizzle wraps driver errors, so the pg SQLSTATE may sit on `cause`. */
export function isUniqueViolation(error: unknown): boolean {
	let current: unknown = error;
	while (current && typeof current === "object") {
		if ((current as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

// Months whose time_entries partition this process already ensured. Purely a
// round-trip saver: the SQL function is idempotent, so a cold cache (restart,
// another instance) only costs one cheap extra call per month.
const ensuredMonths = new Set<string>();

/**
 * Makes sure the monthly partition for `workDate` exists before a row is
 * written to it, so rows never land in time_entries_default (which would
 * block creating that month's partition later).
 */
export async function ensureTimeEntriesPartition(
	db: Database,
	workDate: string
): Promise<void> {
	const month = workDate.slice(0, 7);
	if (ensuredMonths.has(month)) {
		return;
	}
	await db.execute(
		sql`select ensure_time_entries_partition(${workDate}::date)`
	);
	ensuredMonths.add(month);
}

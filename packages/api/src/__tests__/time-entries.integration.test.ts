import type { Session } from "@hourino/auth";
import type { AuthServices } from "@hourino/auth/composition";
import { createDb, type Database } from "@hourino/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

/**
 * Runs the categories/time-entries routers against a real Postgres. Skipped
 * unless INTEGRATION_DATABASE_URL is set, e.g. against the local lane:
 *   bun run docker:up && (cd packages/db && bunx drizzle-kit migrate)
 *   INTEGRATION_DATABASE_URL=postgresql://hourino:hourino@db.localtest.me:5432/hourino_dev bunx vitest run
 * Creates and deletes its own user; never touches other rows.
 */
const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
// Every query is an HTTP round trip through the Neon proxy.
const LIFECYCLE_TIMEOUT_MS = 60_000;

describe.skipIf(!DATABASE_URL)("routers against a real database", () => {
	const userId = `it_${crypto.randomUUID()}`;
	const session = {
		session: { expiresAt: new Date(Date.now() + 60_000), id: "it_session" },
		user: { email: `${userId}@example.com`, id: userId, name: "Integration" },
	} as unknown as Session;

	// Created in beforeAll, not here: Vitest still runs a skipped describe's
	// body to collect tests, and createDb("") throws without a URL.
	let db: Database;
	let api: ReturnType<typeof appRouter.createCaller>;

	beforeAll(async () => {
		db = createDb({ DATABASE_URL: DATABASE_URL ?? "" });
		api = appRouter.createCaller({
			authServices: {} as AuthServices,
			cookies: { setCookies: vi.fn() },
			db,
			requestHeaders: new Headers(),
			session,
			webOrigin: "http://localhost:3001",
		} satisfies Context);
		await db.execute(sql`
			insert into "user" (id, name, email, email_verified, created_at, updated_at)
			values (${userId}, 'Integration', ${`${userId}@example.com`}, false, now(), now())
		`);
	});

	afterAll(async () => {
		// Cascades to categories, time_entries and their links.
		await db.execute(sql`delete from "user" where id = ${userId}`);
	});

	it(
		"runs the full category and time-entry lifecycle",
		async () => {
			const meetings = await api.categories.create({ name: "Meetings" });
			expect(meetings.color).toBe("powder");
			const deepWork = await api.categories.create({
				color: "ochre",
				name: "Deep work",
			});

			await expect(
				api.categories.create({ name: "meetings" })
			).rejects.toMatchObject({ code: "CONFLICT" });

			// A month far outside the seeded partition window: the API must create
			// the partition on demand instead of writing into the default one.
			const created = await api.timeEntries.create({
				categoryIds: [meetings.id, deepWork.id],
				description: "Client sync",
				endMinute: 630,
				startMinute: 540,
				workDate: "2031-06-15",
			});
			expect(created.minutesWorked).toBe(90);
			expect(created.categoryIds).toEqual([meetings.id, deepWork.id].sort());

			const partition = await db.execute<{ name: string | null }>(
				sql`select to_regclass('time_entries_y2031m06')::text as name`
			);
			expect(partition.rows[0]?.name).toBe("time_entries_y2031m06");
			const inDefault = await db.execute<{ n: number }>(
				sql`select count(*)::int as n from time_entries_default where user_id = ${userId}`
			);
			expect(inDefault.rows[0]?.n).toBe(0);

			const byId = await api.timeEntries.getById({ id: created.id });
			expect(byId).toEqual(created);

			const window = await api.timeEntries.list({
				from: "2031-06-01",
				to: "2031-07-01",
			});
			expect(window.map((entry) => entry.id)).toEqual([created.id]);
			expect(window[0]?.categoryIds).toEqual(created.categoryIds);

			const filtered = await api.timeEntries.list({
				categoryIds: [deepWork.id],
				from: "2031-06-01",
				search: "client",
				to: "2031-07-01",
			});
			expect(filtered).toHaveLength(1);
			const noMatch = await api.timeEntries.list({
				from: "2031-06-01",
				search: "100%_literal",
				to: "2031-07-01",
			});
			expect(noMatch).toHaveLength(0);

			// Move to another month (another partition) without touching categories:
			// the links must follow via ON UPDATE CASCADE.
			const moved = await api.timeEntries.update({
				id: created.id,
				workDate: "2031-07-02",
			});
			expect(moved.workDate).toBe("2031-07-02");
			expect(moved.categoryIds).toEqual(created.categoryIds);

			const replaced = await api.timeEntries.update({
				categoryIds: [deepWork.id],
				endMinute: 660,
				id: created.id,
			});
			expect(replaced.categoryIds).toEqual([deepWork.id]);
			expect(replaced.minutesWorked).toBe(120);

			await expect(
				api.timeEntries.update({ id: created.id, startMinute: 700 })
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			// Soft-deleted categories stay resolvable for old entries.
			await api.categories.delete({ id: deepWork.id });
			const active = await api.categories.list({});
			expect(active.items.map((c) => c.id)).toEqual([meetings.id]);
			const all = await api.categories.list({ status: "all" });
			expect(all.total).toBe(2);
			const page = await api.categories.list({
				limit: 1,
				sortBy: "name",
				status: "all",
			});
			expect(page.items[0]?.name).toBe("Deep work");
			expect(page.total).toBe(2);

			// The entry still carries the now-deleted "Deep work": keeping it
			// while adding another category must work...
			const kept = await api.timeEntries.update({
				categoryIds: [deepWork.id, meetings.id],
				id: created.id,
			});
			expect(kept.categoryIds).toEqual([deepWork.id, meetings.id].sort());
			// ...but once dropped, a deleted category can't be added back.
			await api.timeEntries.update({
				categoryIds: [meetings.id],
				id: created.id,
			});
			await expect(
				api.timeEntries.update({
					categoryIds: [meetings.id, deepWork.id],
					id: created.id,
				})
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			const restored = await api.categories.restore({ id: deepWork.id });
			expect(restored.deletedAt).toBeNull();

			await api.timeEntries.delete({ id: created.id });
			await expect(
				api.timeEntries.getById({ id: created.id })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect(
				await api.timeEntries.list({ from: "2031-07-01", to: "2031-08-01" })
			).toHaveLength(0);
		},
		LIFECYCLE_TIMEOUT_MS
	);
});

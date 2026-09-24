import type { Database } from "@hourino/db";
import {
	categories,
	timeEntries,
	timeEntryCategories,
} from "@hourino/db/schema/index";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	eq,
	exists,
	gte,
	ilike,
	inArray,
	isNull,
	lt,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	daysBetween,
	ensureTimeEntriesPartition,
	escapeLike,
	isoDateSchema,
	queryArray,
	successSchema,
} from "./shared";

const MINUTES_PER_DAY = 1440;
/** A 6-week month grid — the widest window the calendar ever renders. */
const MAX_RANGE_DAYS = 42;
const MAX_CATEGORIES_PER_ENTRY = 10;
const MAX_FILTER_CATEGORIES = 50;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SEARCH_LENGTH = 100;

const startMinuteSchema = z
	.number()
	.int()
	.min(0)
	.max(MINUTES_PER_DAY - 1)
	.describe("Minutes from local midnight (09:30 → 570)");

const endMinuteSchema = z
	.number()
	.int()
	.min(1)
	.max(MINUTES_PER_DAY)
	.describe("Minutes from local midnight, exclusive; 1440 = midnight");

const descriptionSchema = z.string().trim().max(MAX_DESCRIPTION_LENGTH);

const categoryIdsSchema = z
	.array(z.uuid())
	.max(MAX_CATEGORIES_PER_ENTRY)
	.transform((ids) => [...new Set(ids)]);

const timeEntrySchema = z.object({
	categoryIds: z.array(z.uuid()),
	description: z.string().nullable(),
	endMinute: z.number().int(),
	id: z.uuid(),
	minutesWorked: z.number().int(),
	startMinute: z.number().int(),
	workDate: z.string(),
});

type TimeEntryDto = z.infer<typeof timeEntrySchema>;

const endAfterStart = {
	message: "endMinute must be after startMinute",
	path: ["endMinute"],
};

const entryColumns = {
	description: timeEntries.description,
	endMinute: timeEntries.endMinute,
	id: timeEntries.id,
	startMinute: timeEntries.startMinute,
	workDate: timeEntries.workDate,
};

type EntryRow = Omit<TimeEntryDto, "categoryIds" | "minutesWorked">;

function toDto(row: EntryRow, categoryIds: string[]): TimeEntryDto {
	return {
		...row,
		categoryIds,
		// Same expression as the generated column; computed here so the DTO
		// never depends on the driver returning generated values.
		minutesWorked: row.endMinute - row.startMinute,
	};
}

const notFound = () =>
	new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." });

/** Rejects category ids that don't exist, aren't the user's, or are deleted. */
async function assertAssignableCategories(
	db: Database,
	userId: string,
	categoryIds: string[]
): Promise<void> {
	if (categoryIds.length === 0) {
		return;
	}
	const owned = await db
		.select({ id: categories.id })
		.from(categories)
		.where(
			and(
				eq(categories.userId, userId),
				inArray(categories.id, categoryIds),
				isNull(categories.deletedAt)
			)
		);
	if (owned.length !== categoryIds.length) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "One or more categories do not exist.",
		});
	}
}

function linkRows(
	entryId: string,
	workDate: string,
	userId: string,
	categoryIds: string[]
) {
	return categoryIds.map((categoryId) => ({
		categoryId,
		entryId,
		userId,
		workDate,
	}));
}

// One correlated ARRAY() per entry, served index-only by the link table's PK
// (entry_id, work_date, category_id) — no GROUP BY, no N+1. Cast to text[]
// so the driver hands back a plain string array.
const categoryIdsColumn = sql<string[]>`array(
	select ${timeEntryCategories.categoryId}
	from ${timeEntryCategories}
	where ${timeEntryCategories.entryId} = ${timeEntries.id}
		and ${timeEntryCategories.workDate} = ${timeEntries.workDate}
	order by ${timeEntryCategories.categoryId}
)::text[]`;

export const timeEntriesRouter = router({
	create: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/time-entries",
				protect: true,
				summary: "Create a time entry",
				tags: ["time-entries"],
			},
		})
		.input(
			z
				.object({
					categoryIds: categoryIdsSchema.default([]),
					description: descriptionSchema.optional(),
					endMinute: endMinuteSchema,
					startMinute: startMinuteSchema,
					workDate: isoDateSchema,
				})
				.refine((v) => v.endMinute > v.startMinute, endAfterStart)
		)
		.output(timeEntrySchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { categoryIds, ...fields } = input;
			const id = crypto.randomUUID();

			await assertAssignableCategories(ctx.db, userId, categoryIds);
			await ensureTimeEntriesPartition(ctx.db, fields.workDate);

			const insertEntry = ctx.db
				.insert(timeEntries)
				.values({
					...fields,
					description: fields.description || null,
					id,
					userId,
				})
				.returning(entryColumns);

			// neon-http has no interactive transactions; batch() runs every
			// statement in one server-side transaction instead.
			const [created] =
				categoryIds.length === 0
					? await insertEntry
					: (
							await ctx.db.batch([
								insertEntry,
								ctx.db
									.insert(timeEntryCategories)
									.values(linkRows(id, fields.workDate, userId, categoryIds)),
							])
						)[0];
			if (!created) {
				throw new Error("Insert returned no row");
			}
			return toDto(created, [...categoryIds].sort());
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/time-entries/{id}",
				protect: true,
				summary: "Soft-delete a time entry",
				tags: ["time-entries"],
			},
		})
		.input(z.object({ id: z.uuid() }))
		.output(successSchema)
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.update(timeEntries)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(timeEntries.id, input.id),
						eq(timeEntries.userId, ctx.session.user.id),
						isNull(timeEntries.deletedAt)
					)
				)
				.returning({ id: timeEntries.id });
			if (!deleted) {
				throw notFound();
			}
			return { success: true as const };
		}),

	getById: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/time-entries/{id}",
				protect: true,
				summary: "Read one time entry",
				tags: ["time-entries"],
			},
		})
		.input(z.object({ id: z.uuid() }))
		.output(timeEntrySchema)
		.query(async ({ ctx, input }) => {
			// No work_date in the key, so this probes each partition's PK index
			// (id leads it) — cheap, a few dozen index lookups at most.
			const [row] = await ctx.db
				.select({ ...entryColumns, categoryIds: categoryIdsColumn })
				.from(timeEntries)
				.where(
					and(
						eq(timeEntries.id, input.id),
						eq(timeEntries.userId, ctx.session.user.id),
						isNull(timeEntries.deletedAt)
					)
				);
			if (!row) {
				throw notFound();
			}
			const { categoryIds, ...entry } = row;
			return toDto(entry, categoryIds);
		}),

	/**
	 * Calendar read path: every non-deleted entry in `[from, to)`, ordered by
	 * day then start time, each with its category ids (resolve them against
	 * `categories.list({ status: "all" })`). One query: partition pruning on
	 * work_date + the (user_id, work_date, start_minute) partial index.
	 *
	 * The calendar should fetch the visible window unfiltered, cache it per
	 * window, prefetch the neighbouring windows, and apply category/search
	 * filters client-side. The server filters are for list/report views.
	 */
	list: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/time-entries",
				protect: true,
				summary: "List time entries in a date window",
				tags: ["time-entries"],
			},
		})
		.input(
			z
				.object({
					categoryIds: queryArray(z.uuid(), MAX_FILTER_CATEGORIES)
						.optional()
						.describe("Only entries with at least one of these categories"),
					from: isoDateSchema.describe("Inclusive start day"),
					search: z
						.string()
						.trim()
						.min(1)
						.max(MAX_SEARCH_LENGTH)
						.optional()
						.describe("Case-insensitive substring of the description"),
					to: isoDateSchema.describe("Exclusive end day"),
				})
				.refine((v) => v.to > v.from, {
					message: "`to` must be after `from`",
					path: ["to"],
				})
				.refine((v) => daysBetween(v.from, v.to) <= MAX_RANGE_DAYS, {
					message: `Range can span at most ${MAX_RANGE_DAYS} days`,
					path: ["to"],
				})
		)
		.output(z.array(timeEntrySchema))
		.query(async ({ ctx, input }) => {
			const conditions = [
				eq(timeEntries.userId, ctx.session.user.id),
				gte(timeEntries.workDate, input.from),
				lt(timeEntries.workDate, input.to),
				isNull(timeEntries.deletedAt),
			];

			if (input.categoryIds && input.categoryIds.length > 0) {
				conditions.push(
					exists(
						ctx.db
							.select({ one: sql`1` })
							.from(timeEntryCategories)
							.where(
								and(
									eq(timeEntryCategories.entryId, timeEntries.id),
									eq(timeEntryCategories.workDate, timeEntries.workDate),
									inArray(timeEntryCategories.categoryId, input.categoryIds)
								)
							)
					)
				);
			}

			if (input.search) {
				conditions.push(
					ilike(timeEntries.description, `%${escapeLike(input.search)}%`)
				);
			}

			const rows = await ctx.db
				.select({ ...entryColumns, categoryIds: categoryIdsColumn })
				.from(timeEntries)
				.where(and(...conditions))
				.orderBy(asc(timeEntries.workDate), asc(timeEntries.startMinute));

			return rows.map(({ categoryIds, ...row }) => toDto(row, categoryIds));
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/time-entries/{id}",
				protect: true,
				summary: "Update a time entry",
				tags: ["time-entries"],
			},
		})
		.input(
			z.object({
				categoryIds: categoryIdsSchema
					.optional()
					.describe("Replaces the whole set when present"),
				description: descriptionSchema
					.nullable()
					.optional()
					.describe("null clears it"),
				endMinute: endMinuteSchema.optional(),
				id: z.uuid(),
				startMinute: startMinuteSchema.optional(),
				workDate: isoDateSchema.optional(),
			})
		)
		.output(timeEntrySchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { categoryIds, id, ...changes } = input;

			// Partial updates need the current row to validate start < end, and
			// its current categories to tell kept links from new ones.
			const [current] = await ctx.db
				.select({ ...entryColumns, categoryIds: categoryIdsColumn })
				.from(timeEntries)
				.where(
					and(
						eq(timeEntries.id, id),
						eq(timeEntries.userId, userId),
						isNull(timeEntries.deletedAt)
					)
				);
			if (!current) {
				throw notFound();
			}

			const next = {
				description:
					changes.description === undefined
						? current.description
						: changes.description || null,
				endMinute: changes.endMinute ?? current.endMinute,
				startMinute: changes.startMinute ?? current.startMinute,
				workDate: changes.workDate ?? current.workDate,
			};
			if (next.endMinute <= next.startMinute) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: endAfterStart.message,
				});
			}

			if (categoryIds) {
				// Only newly added categories must be active. Keeping a link the
				// entry already has is allowed even if that category was deleted
				// since, otherwise an old entry could never be re-categorized
				// without first dropping its deleted category.
				await assertAssignableCategories(
					ctx.db,
					userId,
					categoryIds.filter(
						(categoryId) => !current.categoryIds.includes(categoryId)
					)
				);
			}
			if (next.workDate !== current.workDate) {
				await ensureTimeEntriesPartition(ctx.db, next.workDate);
			}

			// Pinning work_date to the current value lets Postgres prune to a
			// single partition. If work_date changes, the row moves partitions
			// and the link FK's ON UPDATE CASCADE carries its links along.
			const updateEntry = ctx.db
				.update(timeEntries)
				.set({ ...next, updatedAt: new Date() })
				.where(
					and(
						eq(timeEntries.id, id),
						eq(timeEntries.workDate, current.workDate),
						eq(timeEntries.userId, userId),
						isNull(timeEntries.deletedAt)
					)
				)
				.returning(entryColumns);

			let updated: EntryRow | undefined;
			if (categoryIds) {
				const clearLinks = ctx.db
					.delete(timeEntryCategories)
					.where(eq(timeEntryCategories.entryId, id));
				const [updatedRows] =
					categoryIds.length === 0
						? await ctx.db.batch([updateEntry, clearLinks])
						: await ctx.db.batch([
								updateEntry,
								clearLinks,
								ctx.db
									.insert(timeEntryCategories)
									.values(linkRows(id, next.workDate, userId, categoryIds)),
							]);
				[updated] = updatedRows;
			} else {
				[updated] = await updateEntry;
			}
			if (!updated) {
				throw notFound();
			}

			const finalCategoryIds = categoryIds
				? [...categoryIds].sort()
				: (
						await ctx.db
							.select({ categoryId: timeEntryCategories.categoryId })
							.from(timeEntryCategories)
							.where(
								and(
									eq(timeEntryCategories.entryId, id),
									eq(timeEntryCategories.workDate, updated.workDate)
								)
							)
							.orderBy(asc(timeEntryCategories.categoryId))
					).map((link) => link.categoryId);

			return toDto(updated, finalCategoryIds);
		}),
});

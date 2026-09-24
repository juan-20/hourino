import {
	CATEGORY_COLORS,
	categories,
	DEFAULT_CATEGORY_COLOR,
} from "@hourino/db/schema/index";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	escapeLike,
	isUniqueViolation,
	queryArray,
	successSchema,
} from "./shared";

const MAX_NAME_LENGTH = 40;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10_000;

const categoryColorSchema = z.enum(CATEGORY_COLORS);

const categorySchema = z.object({
	color: categoryColorSchema,
	createdAt: z.date(),
	/** Set once soft-deleted. Deleted categories stay readable so old entries still render. */
	deletedAt: z.date().nullable(),
	id: z.uuid(),
	name: z.string(),
	updatedAt: z.date(),
});

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

const idInputSchema = z.object({ id: z.uuid() });

const categoryColumns = {
	color: categories.color,
	createdAt: categories.createdAt,
	deletedAt: categories.deletedAt,
	id: categories.id,
	name: categories.name,
	updatedAt: categories.updatedAt,
};

const listInputSchema = z.object({
	colors: queryArray(categoryColorSchema, CATEGORY_COLORS.length)
		.optional()
		.describe("Only categories with one of these colors"),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
	offset: z.number().int().min(0).max(MAX_OFFSET).default(0),
	search: z
		.string()
		.trim()
		.min(1)
		.max(MAX_NAME_LENGTH)
		.optional()
		.describe("Case-insensitive substring of the name"),
	sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("name"),
	sortOrder: z.enum(["asc", "desc"]).default("asc"),
	status: z
		.enum(["active", "deleted", "all"])
		.default("active")
		.describe(
			"Use `all` for calendar lookups, so entries tagged with a since-deleted category still resolve"
		),
});

const listOutputSchema = z.object({
	items: z.array(categorySchema),
	limit: z.number().int(),
	offset: z.number().int(),
	total: z.number().int(),
});

const sortColumns = {
	createdAt: categories.createdAt,
	name: sql`lower(${categories.name})`,
	updatedAt: categories.updatedAt,
};

function nameConflict(error: unknown): never {
	if (isUniqueViolation(error)) {
		throw new TRPCError({
			cause: error,
			code: "CONFLICT",
			message: "A category with this name already exists.",
		});
	}
	throw error;
}

const notFound = () =>
	new TRPCError({ code: "NOT_FOUND", message: "Category not found." });

export const categoriesRouter = router({
	create: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/categories",
				protect: true,
				summary: "Create a category",
				tags: ["categories"],
			},
		})
		.input(
			z.object({
				color: categoryColorSchema.default(DEFAULT_CATEGORY_COLOR),
				name: nameSchema,
			})
		)
		.output(categorySchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const [created] = await ctx.db
					.insert(categories)
					.values({ ...input, userId: ctx.session.user.id })
					.returning(categoryColumns);
				if (!created) {
					throw new Error("Insert returned no row");
				}
				return created;
			} catch (error) {
				return nameConflict(error);
			}
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/categories/{id}",
				protect: true,
				summary: "Soft-delete a category (existing entries keep it)",
				tags: ["categories"],
			},
		})
		.input(idInputSchema)
		.output(successSchema)
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.update(categories)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(categories.id, input.id),
						eq(categories.userId, ctx.session.user.id),
						isNull(categories.deletedAt)
					)
				)
				.returning({ id: categories.id });
			if (!deleted) {
				throw notFound();
			}
			return { success: true as const };
		}),

	/** Includes soft-deleted categories (check `deletedAt`). */
	getById: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/categories/{id}",
				protect: true,
				summary: "Read one category",
				tags: ["categories"],
			},
		})
		.input(idInputSchema)
		.output(categorySchema)
		.query(async ({ ctx, input }) => {
			const [category] = await ctx.db
				.select(categoryColumns)
				.from(categories)
				.where(
					and(
						eq(categories.id, input.id),
						eq(categories.userId, ctx.session.user.id)
					)
				);
			if (!category) {
				throw notFound();
			}
			return category;
		}),

	/**
	 * Filtered, sorted, paginated listing. Page and total are fetched in one
	 * round trip via `db.batch`.
	 */
	list: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/categories",
				protect: true,
				summary: "List the user's categories",
				tags: ["categories"],
			},
		})
		.input(listInputSchema)
		.output(listOutputSchema)
		.query(async ({ ctx, input }) => {
			const conditions: SQL[] = [eq(categories.userId, ctx.session.user.id)];

			if (input.status === "active") {
				conditions.push(isNull(categories.deletedAt));
			} else if (input.status === "deleted") {
				conditions.push(isNotNull(categories.deletedAt));
			}
			if (input.colors && input.colors.length > 0) {
				conditions.push(inArray(categories.color, input.colors));
			}
			if (input.search) {
				conditions.push(
					ilike(categories.name, `%${escapeLike(input.search)}%`)
				);
			}

			const where = and(...conditions);
			const direction = input.sortOrder === "asc" ? asc : desc;

			const [items, [totals]] = await ctx.db.batch([
				ctx.db
					.select(categoryColumns)
					.from(categories)
					.where(where)
					// id tiebreaker keeps pages stable when sort keys collide.
					.orderBy(direction(sortColumns[input.sortBy]), asc(categories.id))
					.limit(input.limit)
					.offset(input.offset),
				ctx.db.select({ total: count() }).from(categories).where(where),
			]);

			return {
				items,
				limit: input.limit,
				offset: input.offset,
				total: totals?.total ?? 0,
			};
		}),

	restore: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/categories/{id}/restore",
				protect: true,
				summary: "Restore a soft-deleted category",
				tags: ["categories"],
			},
		})
		.input(idInputSchema)
		.output(categorySchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const [restored] = await ctx.db
					.update(categories)
					.set({ deletedAt: null, updatedAt: new Date() })
					.where(
						and(
							eq(categories.id, input.id),
							eq(categories.userId, ctx.session.user.id),
							isNotNull(categories.deletedAt)
						)
					)
					.returning(categoryColumns);
				if (!restored) {
					throw notFound();
				}
				return restored;
			} catch (error) {
				// An active category may have taken the name in the meantime.
				return nameConflict(error);
			}
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/categories/{id}",
				protect: true,
				summary: "Rename or recolor a category",
				tags: ["categories"],
			},
		})
		.input(
			z.object({
				color: categoryColorSchema.optional(),
				id: z.uuid(),
				name: nameSchema.optional(),
			})
		)
		.output(categorySchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...changes } = input;
			try {
				const [updated] = await ctx.db
					.update(categories)
					.set({ ...changes, updatedAt: new Date() })
					.where(
						and(
							eq(categories.id, id),
							eq(categories.userId, ctx.session.user.id),
							isNull(categories.deletedAt)
						)
					)
					.returning(categoryColumns);
				if (!updated) {
					throw notFound();
				}
				return updated;
			} catch (error) {
				return nameConflict(error);
			}
		}),
});

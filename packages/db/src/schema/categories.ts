import { defineRelationsPart, sql } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Curated palette keys — never raw hex. Each key maps to a contrast-verified
// `--category-<key>` / `--category-<key>-foreground` token pair in
// packages/ui/src/styles/globals.css (light AND dark), because the color is
// rendered as the background behind a duration. Adding a key means: new enum
// value (generated migration) + both token pairs in globals.css.
export const CATEGORY_COLORS = [
	"powder",
	"espresso",
	"ochre",
	"terracotta",
	"moss",
	"teal",
	"plum",
	"rose",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const DEFAULT_CATEGORY_COLOR: CategoryColor = "powder";

export const categoryColor = pgEnum("category_color", CATEGORY_COLORS);

export const categories = pgTable(
	"categories",
	{
		color: categoryColor("color").notNull().default(DEFAULT_CATEGORY_COLOR),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// Soft delete: historical entries keep rendering the chip of a
		// category that was removed later.
		deletedAt: timestamp("deleted_at"),
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("categories_user_id_idx").on(table.userId),
		uniqueIndex("categories_user_name_active_idx")
			.on(table.userId, sql`lower(${table.name})`)
			.where(sql`${table.deletedAt} is null`),
	]
);

export const categoriesRelations = defineRelationsPart(
	{ categories, user },
	(r) => ({
		categories: {
			user: r.one.user({ from: r.categories.userId, to: r.user.id }),
		},
	})
);

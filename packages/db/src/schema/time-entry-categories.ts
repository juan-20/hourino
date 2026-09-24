import { defineRelationsPart } from "drizzle-orm";
import {
	date,
	foreignKey,
	index,
	pgTable,
	primaryKey,
	text,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { categories } from "./categories";
import { timeEntries } from "./time-entries";

// Many-to-many link between time_entries and categories. time_entries is
// partitioned with PK (id, work_date), so the link carries work_date too —
// that's what makes the composite FK possible, and it keeps every calendar
// lookup ((entry_id, work_date) → category ids) an index-only scan on the PK.
//
// ON UPDATE CASCADE on the composite FK: moving an entry to another month
// changes its partition; since PG 15 that cross-partition UPDATE fires the
// referential action as an UPDATE (not DELETE+INSERT), so links follow.
//
// user_id is denormalized from the entry so category filters can be served by
// (user_id, category_id, work_date) without touching time_entries first.
export const timeEntryCategories = pgTable(
	"time_entry_categories",
	{
		categoryId: uuid("category_id")
			.notNull()
			.references(() => categories.id, { onDelete: "cascade" }),
		entryId: uuid("entry_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		workDate: date("work_date", { mode: "string" }).notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.entryId, table.workDate, table.categoryId],
			name: "time_entry_categories_pkey",
		}),
		foreignKey({
			columns: [table.entryId, table.workDate],
			foreignColumns: [timeEntries.id, timeEntries.workDate],
			name: "time_entry_categories_entry_fkey",
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("time_entry_categories_user_category_work_date_idx").on(
			table.userId,
			table.categoryId,
			table.workDate
		),
	]
);

export const timeEntryCategoriesRelations = defineRelationsPart(
	{ categories, timeEntries, timeEntryCategories },
	(r) => ({
		timeEntryCategories: {
			category: r.one.categories({
				from: r.timeEntryCategories.categoryId,
				to: r.categories.id,
			}),
			entry: r.one.timeEntries({
				from: [r.timeEntryCategories.entryId, r.timeEntryCategories.workDate],
				to: [r.timeEntries.id, r.timeEntries.workDate],
			}),
		},
	})
);

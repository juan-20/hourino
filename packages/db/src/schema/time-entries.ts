import { defineRelationsPart } from "drizzle-orm";
import {
	date,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";

// This table is physically RANGE-partitioned by work_date (monthly).
// The partitioning DDL, composite PK (id, work_date), CHECK constraints and
// BOTH indexes on this table are hand-authored raw SQL in src/migrations —
// drizzle-kit cannot express PARTITION BY and will never see or manage them.
//
// This declaration exists ONLY to give the rest of the app a typed query
// builder (db.query.timeEntries.*, db.insert(timeEntries)...) and relations.
// Rules before touching this file:
//   1. Never add .primaryKey(), unique(), or index() here for this table —
//      any indexes/constraints belong in hand-written SQL migrations.
//   2. Never run `bun run db:push` against a shared/prod branch for this
//      table — push does live introspection and will try to "fix" the
//      partitioned table since it doesn't understand PARTITION BY.
//   3. Column changes: hand-write the ALTER migration (ADD COLUMN on a
//      partitioned parent propagates to all partitions automatically), then
//      mirror the column here so drizzle-kit's snapshot stays in sync.
export const timeEntries = pgTable("time_entries", {
	createdAt: timestamp("created_at").defaultNow().notNull(),
	deletedAt: timestamp("deleted_at"),
	id: uuid("id").notNull().defaultRandom(),
	minutesWorked: integer("minutes_worked").notNull(),
	notes: text("notes"),
	projectId: uuid("project_id")
		.notNull()
		.references(() => projects.id, { onDelete: "restrict" }),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	workDate: date("work_date", { mode: "string" }).notNull(),
});

export const timeEntriesRelations = defineRelationsPart(
	{ projects, timeEntries, user },
	(r) => ({
		timeEntries: {
			project: r.one.projects({
				from: r.timeEntries.projectId,
				to: r.projects.id,
			}),
			user: r.one.user({ from: r.timeEntries.userId, to: r.user.id }),
		},
	})
);

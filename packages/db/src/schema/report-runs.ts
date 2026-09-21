import { defineRelationsPart } from "drizzle-orm";
import {
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const reportRuns = pgTable(
	"report_runs",
	{
		createdAt: timestamp("created_at").defaultNow().notNull(),
		generatedAt: timestamp("generated_at"),
		id: uuid("id").primaryKey().defaultRandom(),
		period: text("period").notNull(),
		status: text("status").notNull().default("pending"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("report_runs_user_id_period_idx").on(
			table.userId,
			table.period
		),
	]
);

export const reportRunsRelations = defineRelationsPart(
	{ reportRuns, user },
	(r) => ({
		reportRuns: {
			user: r.one.user({ from: r.reportRuns.userId, to: r.user.id }),
		},
	})
);

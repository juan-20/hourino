import {
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Populated exclusively by the refresh_monthly_summaries(target_month) SQL
// function (see migrations) — never written to directly from app code.
// user_id is nullable: the GROUPING SETS grand-total rollup row uses NULL for
// it. No unique index on (period_month, user_id): Postgres treats NULLs as
// distinct in a unique index, so it wouldn't dedupe rollup rows anyway —
// idempotency is handled by DELETE + INSERT per period inside the refresh
// function instead.
export const monthlySummaries = pgTable(
	"monthly_summaries",
	{
		entryCount: integer("entry_count").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		periodMonth: date("period_month", { mode: "string" }).notNull(),
		refreshedAt: timestamp("refreshed_at").defaultNow().notNull(),
		totalMinutes: integer("total_minutes").notNull(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("monthly_summaries_user_idx").on(table.userId),
		index("monthly_summaries_period_idx").on(table.periodMonth),
	]
);

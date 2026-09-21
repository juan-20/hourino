-- Custom SQL migration file, put your code below! --

-- Indexes on a partitioned parent auto-propagate to every existing and
-- future child partition (PG 11+), so no per-partition index DDL is needed.
CREATE INDEX "time_entries_user_work_date_covering_idx"
	ON "time_entries" ("user_id", "work_date")
	INCLUDE ("minutes_worked", "project_id")
	WHERE "deleted_at" IS NULL;
--> statement-breakpoint

CREATE INDEX "time_entries_project_work_date_idx"
	ON "time_entries" ("project_id", "work_date");

-- Hand-edited after `drizzle-kit generate` (snapshot.json is the generated
-- one and matches the schema files). The generated SQL was rewritten because
-- time_entries is a hand-written partitioned table: its real constraint
-- names differ from drizzle's (inline REFERENCES → time_entries_project_id_fkey),
-- and existing rows need a backfill before columns are dropped/tightened.
--
-- Changes:
--   * projects dropped (one project per user was just an alias for user_id;
--     categories are the classification now)
--   * time_entries moves to a local wall-clock model: start_minute/end_minute
--     (minutes from local midnight), minutes_worked becomes GENERATED
--   * notes → description

-- 1. Backfill wall-clock times for rows that only had minutes_worked: start
--    at 09:00 (or earlier if the duration wouldn't fit before midnight) and
--    keep the duration, with a 1-minute floor so start < end holds.
UPDATE "time_entries"
SET
	"start_minute" = GREATEST(0, LEAST(540, 1440 - GREATEST("minutes_worked", 1))),
	"end_minute" = GREATEST(0, LEAST(540, 1440 - GREATEST("minutes_worked", 1)))
		+ LEAST(GREATEST("minutes_worked", 1), 1440)
WHERE "start_minute" IS NULL OR "end_minute" IS NULL;
--> statement-breakpoint
UPDATE "time_entries" SET "description" = "notes"
WHERE "description" IS NULL AND "notes" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "start_minute" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "end_minute" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_wall_clock_range"
	CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440);
--> statement-breakpoint

-- 2. Old indexes reference columns being dropped (project_id, minutes_worked).
DROP INDEX IF EXISTS "time_entries_user_work_date_covering_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "time_entries_project_work_date_idx";
--> statement-breakpoint

-- 3. minutes_worked becomes derived. Its CHECK (>= 0) is subsumed by the
--    wall-clock range check above.
ALTER TABLE "time_entries" DROP CONSTRAINT IF EXISTS "time_entries_minutes_worked_nonneg";
--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "minutes_worked";
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "minutes_worked" integer
	GENERATED ALWAYS AS ("end_minute" - "start_minute") STORED;
--> statement-breakpoint
ALTER TABLE "time_entries" DROP COLUMN "notes";
--> statement-breakpoint
-- Dropping the column drops its FK too, whatever the constraint is named.
ALTER TABLE "time_entries" DROP COLUMN "project_id";
--> statement-breakpoint

-- 4. Calendar read path: every query is "one user, a date window, not
--    deleted", ordered by day then start time. Partition pruning picks the
--    month(s); this index returns rows already in render order.
CREATE INDEX "time_entries_user_work_date_start_idx"
	ON "time_entries" ("user_id", "work_date", "start_minute")
	WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- 5. monthly_summaries loses its project dimension, then projects goes.
DROP INDEX IF EXISTS "monthly_summaries_project_idx";
--> statement-breakpoint
ALTER TABLE "monthly_summaries" DROP COLUMN "project_id";
--> statement-breakpoint
DROP TABLE "projects";
--> statement-breakpoint

CREATE OR REPLACE FUNCTION refresh_monthly_summaries(target_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM monthly_summaries
	WHERE period_month = date_trunc('month', target_month)::date;

	INSERT INTO monthly_summaries
		(id, user_id, period_month, total_minutes, entry_count, refreshed_at)
	SELECT
		gen_random_uuid(),
		user_id,
		date_trunc('month', target_month)::date,
		SUM(minutes_worked),
		COUNT(*),
		now()
	FROM time_entries
	WHERE work_date >= date_trunc('month', target_month)::date
		AND work_date < (date_trunc('month', target_month) + interval '1 month')::date
		AND deleted_at IS NULL
	GROUP BY GROUPING SETS ((user_id), ());
END;
$$;
--> statement-breakpoint

-- 6. On-demand partition creation. Without this, an entry logged for a month
--    outside maintain_time_entries_partitions()'s window (any past month, or
--    >3 months ahead) lands in time_entries_default — and once the default
--    holds rows for a month, CREATE TABLE ... PARTITION OF for that month
--    fails. The API calls this before every write whose month it hasn't seen
--    yet in the current process. IF NOT EXISTS absorbs concurrent callers.
CREATE OR REPLACE FUNCTION ensure_time_entries_partition(target date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	part_start date := date_trunc('month', target)::date;
	part_end date := (date_trunc('month', target) + interval '1 month')::date;
	part_name text := 'time_entries_y' || to_char(target, 'YYYY') || 'm' || to_char(target, 'MM');
BEGIN
	IF to_regclass(part_name) IS NULL THEN
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I PARTITION OF time_entries FOR VALUES FROM (%L) TO (%L)',
			part_name, part_start, part_end
		);
	END IF;
END;
$$;

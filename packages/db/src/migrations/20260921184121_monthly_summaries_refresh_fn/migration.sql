-- Custom SQL migration file, put your code below! --

-- Recomputes monthly_summaries for one month from time_entries. Runs as a
-- single DB round trip (createDb() uses drizzle-orm/neon-http, which has no
-- multi-statement interactive transactions from the app runtime) but the
-- function body itself still commits/rolls back atomically server-side.
-- Re-invoke for any month whose time_entries changed after month-end
-- (late edits/soft-deletes) — this function does not track staleness.
CREATE OR REPLACE FUNCTION refresh_monthly_summaries(target_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM monthly_summaries
	WHERE period_month = date_trunc('month', target_month)::date;

	INSERT INTO monthly_summaries
		(id, user_id, project_id, period_month, total_minutes, entry_count, refreshed_at)
	SELECT
		gen_random_uuid(),
		user_id,
		project_id,
		date_trunc('month', target_month)::date,
		SUM(minutes_worked),
		COUNT(*),
		now()
	FROM time_entries
	WHERE work_date >= date_trunc('month', target_month)::date
		AND work_date < (date_trunc('month', target_month) + interval '1 month')::date
		AND deleted_at IS NULL
	GROUP BY GROUPING SETS ((user_id, project_id), (user_id), ());
END;
$$;

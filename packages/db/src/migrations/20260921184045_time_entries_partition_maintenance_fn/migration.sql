-- Custom SQL migration file, put your code below! --

-- Creates missing monthly time_entries partitions, idempotently. Not
-- scheduled by this migration: no cron/queue infra exists in this repo yet
-- (see the "Phase 4: CRONs & Background Workers" board item). Invoke
-- manually (`SELECT maintain_time_entries_partitions(3);`) until that
-- lands, at which point its monthly fan-out job calls this directly.
CREATE OR REPLACE FUNCTION maintain_time_entries_partitions(months_ahead int DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	i int;
	part_start date;
	part_end date;
	part_name text;
BEGIN
	FOR i IN 0..months_ahead LOOP
		part_start := date_trunc('month', now() + (i || ' months')::interval)::date;
		part_end := (part_start + interval '1 month')::date;
		part_name := 'time_entries_y' || to_char(part_start, 'YYYY') || 'm' || to_char(part_start, 'MM');

		IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
			EXECUTE format(
				'CREATE TABLE %I PARTITION OF time_entries FOR VALUES FROM (%L) TO (%L)',
				part_name, part_start, part_end
			);
		END IF;
	END LOOP;
END;
$$;

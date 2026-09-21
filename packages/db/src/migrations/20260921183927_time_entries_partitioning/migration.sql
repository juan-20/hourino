-- Custom SQL migration file, put your code below! --

-- drizzle-kit has no DSL for PARTITION BY; this migration replaces the plain
-- time_entries table from the previous migration with a RANGE-partitioned
-- version. The packages/db/src/schema/time-entries.ts Drizzle declaration is
-- typing-only from this point forward — never regenerate this table's DDL.
DROP TABLE IF EXISTS "time_entries";

CREATE TABLE "time_entries" (
	"id" uuid NOT NULL DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
	"work_date" date NOT NULL,
	"minutes_worked" integer NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id", "work_date"),
	CONSTRAINT "time_entries_minutes_worked_nonneg" CHECK ("minutes_worked" >= 0)
) PARTITION BY RANGE ("work_date");
--> statement-breakpoint

-- Safety net for any work_date outside a materialized monthly partition.
CREATE TABLE "time_entries_default" PARTITION OF "time_entries" DEFAULT;
--> statement-breakpoint

-- Seed a rolling window so day-one inserts land in a real partition, not
-- the default. maintain_time_entries_partitions() (next migration) extends
-- this window going forward.
CREATE TABLE "time_entries_y2026m09" PARTITION OF "time_entries"
	FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
--> statement-breakpoint
CREATE TABLE "time_entries_y2026m10" PARTITION OF "time_entries"
	FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
--> statement-breakpoint
CREATE TABLE "time_entries_y2026m11" PARTITION OF "time_entries"
	FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
--> statement-breakpoint
CREATE TABLE "time_entries_y2026m12" PARTITION OF "time_entries"
	FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TYPE "category_color" AS ENUM('powder', 'espresso', 'ochre', 'terracotta', 'moss', 'teal', 'plum', 'rose');--> statement-breakpoint
CREATE TABLE "categories" (
	"color" "category_color" DEFAULT 'powder'::"category_color" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_categories" (
	"category_id" uuid,
	"entry_id" uuid,
	"user_id" text NOT NULL,
	"work_date" date,
	CONSTRAINT "time_entry_categories_pkey" PRIMARY KEY("entry_id","work_date","category_id")
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "end_minute" smallint;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "start_minute" smallint;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_active_idx" ON "categories" ("user_id",lower("name")) WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "time_entry_categories_user_category_work_date_idx" ON "time_entry_categories" ("user_id","category_id","work_date");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "time_entry_categories" ADD CONSTRAINT "time_entry_categories_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "time_entry_categories" ADD CONSTRAINT "time_entry_categories_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "time_entry_categories" ADD CONSTRAINT "time_entry_categories_entry_fkey" FOREIGN KEY ("entry_id","work_date") REFERENCES "time_entries"("id","work_date") ON DELETE CASCADE ON UPDATE CASCADE;
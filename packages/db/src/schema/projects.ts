import { defineRelationsPart } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const projects = pgTable(
	"projects",
	{
		createdAt: timestamp("created_at").defaultNow().notNull(),
		deletedAt: timestamp("deleted_at"),
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("projects_owner_id_idx").on(table.ownerId)]
);

export const projectsRelations = defineRelationsPart(
	{ projects, user },
	(r) => ({
		projects: {
			owner: r.one.user({ from: r.projects.ownerId, to: r.user.id }),
		},
	})
);

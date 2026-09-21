import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = {
	...defineRelations(schema),
	...schema.authRelations,
	...schema.projectsRelations,
	...schema.timeEntriesRelations,
	...schema.reportRunsRelations,
};

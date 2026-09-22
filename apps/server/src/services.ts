import { createAuth } from "@hourino/auth";
import { createDb } from "@hourino/db";

import { CAPTURED_DATABASE_URL } from "./database-url";
import { ENV } from "./env.server";

const databaseUrl = CAPTURED_DATABASE_URL ?? ENV.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL is required but was not found in process.env or ENV."
	);
}

export const db = createDb({ DATABASE_URL: databaseUrl });
export const auth = createAuth(ENV, db);

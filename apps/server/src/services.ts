import { createAuth } from "@hourino/auth";
import { createDb } from "@hourino/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

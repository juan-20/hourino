import type { Session } from "@hourino/auth";
import type { Database } from "@hourino/db";

export type Context = {
  session: Session | null;
  db: Database;
};

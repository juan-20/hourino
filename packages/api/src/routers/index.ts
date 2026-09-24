import { protectedProcedure, publicProcedure, router } from "../index";
import { authRouter } from "./auth";
import { categoriesRouter } from "./categories";
import { timeEntriesRouter } from "./time-entries";

export const appRouter = router({
	auth: authRouter,
	categories: categoriesRouter,
	healthCheck: publicProcedure.query(() => "OK"),
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
	timeEntries: timeEntriesRouter,
});
export type AppRouter = typeof appRouter;

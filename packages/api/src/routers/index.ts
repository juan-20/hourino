import { protectedProcedure, publicProcedure, router } from "../index";
import { authRouter } from "./auth";

export const appRouter = router({
	auth: authRouter,
	healthCheck: publicProcedure.query(() => "OK"),
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
});
export type AppRouter = typeof appRouter;

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	// Runs on every navigation under /_auth, so it must be cheap: the session
	// comes from the query cache (refreshed in the background once stale)
	// instead of a server round trip each time. (The Polar customer-state
	// lookup that used to run here too was unused and has been dropped.)
	beforeLoad: async ({ context: { queryClient } }) => {
		const session = await queryClient.ensureQueryData({
			...sessionQueryOptions,
			revalidateIfStale: true,
		});
		if (!session.data) {
			// Never cache "signed out": the next visit after logging in must
			// look again rather than bounce back to /login.
			queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
			throw redirect({
				to: "/login",
			});
		}
		return { session };
	},
});

function AuthLayout() {
	return <Outlet />;
}

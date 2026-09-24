import { Button } from "@hourino/ui/components/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { authClient, sessionQueryOptions } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/user")({
	component: RouteComponent,
});

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const navigate = useNavigate();

	const user = session.data?.user;
	const currentSession = session.data?.session;

	return (
		<div>
			<h1>User</h1>

			<section>
				<h2>Account</h2>
				{user
					? Object.entries(user).map(([key, value]) => (
							<p key={key}>
								<strong>{key}:</strong> {String(value ?? "—")}
							</p>
						))
					: null}
			</section>

			<section>
				<h2>Session</h2>
				{currentSession
					? Object.entries(currentSession).map(([key, value]) => (
							<p key={key}>
								<strong>{key}:</strong> {String(value ?? "—")}
							</p>
						))
					: null}
			</section>

			<Button
				onClick={() => {
					authClient.signOut({
						fetchOptions: {
							onSuccess: () => {
								// The /_auth guard caches the session; drop it on sign-out.
								queryClient.removeQueries({
									queryKey: sessionQueryOptions.queryKey,
								});
								navigate({ to: "/" });
							},
						},
					});
				}}
				variant="destructive"
			>
				Sign Out
			</Button>
		</div>
	);
}

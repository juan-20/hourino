import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import SignInForm from "@/components/sign-in-form";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	staticData: { chrome: "auth" },
});

function RouteComponent() {
	return (
		<AuthShell>
			<SignInForm />
		</AuthShell>
	);
}

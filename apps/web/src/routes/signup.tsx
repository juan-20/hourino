import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
	staticData: { chrome: "auth" },
});

function RouteComponent() {
	return (
		<AuthShell>
			<SignUpForm />
		</AuthShell>
	);
}

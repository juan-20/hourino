import { Button } from "@hourino/ui/components/button";

import { authClient } from "@/lib/auth-client";

// Module scope: no closure over props/state, so it stays referentially stable.
// callbackURL must be an ABSOLUTE url pointing at the web app's own origin —
// Better Auth resolves a relative path against its own baseURL (the backend),
// so "/calendar" would land the browser on the server after the Google
// OAuth redirect, not on the frontend.
function signInWithGoogle() {
	return authClient.signIn.social({
		callbackURL: `${window.location.origin}/calendar`,
		provider: "google",
	});
}

export function GoogleSignInButton() {
	return (
		<Button
			className="w-full"
			onClick={signInWithGoogle}
			type="button"
			variant="outline"
		>
			Continue with Google
		</Button>
	);
}

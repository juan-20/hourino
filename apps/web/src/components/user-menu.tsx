import { Button } from "@hourino/ui/components/button";
import { Skeleton } from "@hourino/ui/components/skeleton";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-9 w-24" />;
	}

	if (!session) {
		return (
			<Link to="/login">
				<Button variant="outline">Sign In</Button>
			</Link>
		);
	}

	return (
		<Link to="/user">
			<Button variant="outline">{session.user.name}</Button>
		</Link>
	);
}

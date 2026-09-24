import { buttonVariants } from "@hourino/ui/components/button";
import { Skeleton } from "@hourino/ui/components/skeleton";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

// Links styled as buttons (not a <button> inside an <a>, which is invalid
// nesting and gives keyboard users two stops for one control).
export default function UserMenu() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-8 w-24" />;
	}

	if (!session) {
		return (
			<Link className={buttonVariants({ variant: "outline" })} to="/login">
				{m.nav_login()}
			</Link>
		);
	}

	return (
		<Link
			// A long name must not push the header past a phone's width.
			className={buttonVariants({
				className: "max-w-[40vw] sm:max-w-56",
				variant: "outline",
			})}
			title={session.user.name}
			to="/user"
		>
			<span className="truncate">{session.user.name}</span>
		</Link>
	);
}

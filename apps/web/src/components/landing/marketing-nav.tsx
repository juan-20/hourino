import { buttonVariants } from "@hourino/ui/components/button";
import { Skeleton } from "@hourino/ui/components/skeleton";
import { Link } from "@tanstack/react-router";

import { LogoMark } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

import { LocaleToggle } from "./locale-toggle";

function SessionLink() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-8 w-20" />;
	}

	return session ? (
		<Link className={buttonVariants({ variant: "outline" })} to="/dashboard">
			{m.nav_open_dashboard()}
		</Link>
	) : (
		<Link className={buttonVariants({ variant: "ghost" })} to="/login">
			{m.nav_login()}
		</Link>
	);
}

export function MarketingNav() {
	return (
		<header className="border-border border-b-2 bg-background">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
				<Link
					aria-label={m.nav_home()}
					className="flex items-center gap-2 rounded-sm font-bold text-2xl tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					to="/"
				>
					<LogoMark className="size-9" />
					hourino
				</Link>
				<nav className="flex items-center gap-2">
					<LocaleToggle />
					<ModeToggle />
					<SessionLink />
				</nav>
			</div>
		</header>
	);
}

import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages";

import { LogoMark } from "./logo";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const links = [
		{ label: "Home", to: "/" },
		{ label: "Dashboard", to: "/dashboard" },
	] as const;

	return (
		<div className="border-border border-b-2">
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex items-center gap-4 text-lg">
					<Link
						aria-label={m.nav_home()}
						className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						to="/"
					>
						<LogoMark className="size-8" />
					</Link>
					{links.map(({ to, label }) => (
						<Link key={to} to={to}>
							{label}
						</Link>
					))}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</div>
	);
}

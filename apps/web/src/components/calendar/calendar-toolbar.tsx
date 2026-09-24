import { Button, buttonVariants } from "@hourino/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hourino/ui/components/popover";
import { cn } from "@hourino/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	FunnelIcon,
	PlusIcon,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import {
	CALENDAR_VIEWS,
	type CalendarView,
	DEFAULT_ENTRY_MINUTES,
	periodDays,
	shiftDate,
} from "@/lib/calendar";
import { m } from "@/paraglide/messages";

import { type CalendarSearch, storeView } from "./calendar-search";

const VIEW_LABEL: Record<CalendarView, () => string> = {
	day: m.calendar_view_day,
	month: m.calendar_view_month,
	week: m.calendar_view_week,
};

// View-transition types for period navigation; the animations live in
// apps/web/src/index.css and are skipped under prefers-reduced-motion.
const PREV_TRANSITION = { types: ["calendar-prev"] };
const NEXT_TRANSITION = { types: ["calendar-next"] };
const TODAY_TRANSITION = { types: ["calendar-today"] };

/** An explicit Day/Week/Month pick becomes the default for next visits. */
function rememberView(event: MouseEvent<HTMLAnchorElement>) {
	storeView(event.currentTarget.dataset.view as CalendarView);
}

/** "New entry" from the toolbar starts at the next full hour. */
function nextHourMinute(): number {
	const hour = new Date().getHours() + 1;
	return Math.min(hour, 23) * 60;
}

interface CalendarToolbarProps {
	date: string;
	/** Filter UI shown in a popover below `lg`, where the sidebar is hidden. */
	filters: ReactNode;
	hiddenCount: number;
	periodLabel: string;
	search: CalendarSearch;
	today: string;
	view: CalendarView;
}

export function CalendarToolbar({
	date,
	filters,
	hiddenCount,
	periodLabel,
	search,
	today,
	view,
}: CalendarToolbarProps) {
	const base = { hidden: search.hidden, view: search.view };
	const newStart = nextHourMinute();

	return (
		<div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
			<div className="flex items-center gap-1">
				{/* The grid slides in the direction of travel (index.css). */}
				<Link
					className={buttonVariants({ size: "icon", variant: "outline" })}
					search={{ ...base, date: shiftDate(view, date, -1) }}
					to="/calendar"
					viewTransition={PREV_TRANSITION}
				>
					<ChevronLeftIcon aria-hidden="true" />
					<span className="sr-only">{m.calendar_previous()}</span>
				</Link>
				<Link
					className={buttonVariants({ variant: "outline" })}
					search={{ ...base, date: undefined }}
					to="/calendar"
					viewTransition={TODAY_TRANSITION}
				>
					{m.calendar_today()}
				</Link>
				<Link
					className={buttonVariants({ size: "icon", variant: "outline" })}
					search={{ ...base, date: shiftDate(view, date, 1) }}
					to="/calendar"
					viewTransition={NEXT_TRANSITION}
				>
					<ChevronRightIcon aria-hidden="true" />
					<span className="sr-only">{m.calendar_next()}</span>
				</Link>
			</div>

			{/* Full-width first row on phones; inline between the controls from sm up. */}
			<h1 className="order-first w-full min-w-0 truncate font-bold text-lg sm:order-none sm:w-auto sm:flex-1 sm:text-xl">
				{periodLabel}
			</h1>

			<nav
				aria-label={m.calendar_views()}
				className="inline-flex items-center rounded-md border-2 border-border bg-muted p-[3px]"
			>
				{CALENDAR_VIEWS.map((option) => (
					<Link
						aria-current={option === view ? "page" : undefined}
						className={cn(
							"rounded-sm border-2 border-transparent px-2 py-0.5 font-medium text-muted-foreground text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
							option === view &&
								"border-border bg-background text-foreground shadow-brutal-sm"
						)}
						data-view={option}
						key={option}
						onClick={rememberView}
						search={{ ...base, date: search.date, view: option }}
						to="/calendar"
					>
						{VIEW_LABEL[option]()}
					</Link>
				))}
			</nav>

			<Popover>
				<PopoverTrigger
					render={<Button className="lg:hidden" variant="outline" />}
				>
					<FunnelIcon aria-hidden="true" />
					{m.calendar_filters_button()}
					{hiddenCount > 0 ? (
						<span className="font-mono tabular-nums">({hiddenCount})</span>
					) : null}
				</PopoverTrigger>
				<PopoverContent align="end" className="w-72">
					{filters}
				</PopoverContent>
			</Popover>

			<Link
				className={buttonVariants()}
				search={{
					...base,
					date: search.date,
					end: newStart + DEFAULT_ENTRY_MINUTES,
					start: newStart,
					// Today when it's on screen, otherwise the date being viewed.
					workDate: periodDays(view, date).includes(today) ? today : date,
				}}
				to="/calendar/entries/new"
			>
				<PlusIcon aria-hidden="true" />
				{m.calendar_new_entry()}
			</Link>
		</div>
	);
}

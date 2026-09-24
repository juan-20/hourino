import { cn } from "@hourino/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { memo } from "react";

import {
	type CalendarEntry,
	MINUTES_PER_DAY,
	orderedCategories,
	type PositionedEntry,
} from "@/lib/calendar";
import { formatMinutes, minuteToLabel } from "@/lib/time-format";
import { m } from "@/paraglide/messages";

import {
	CATEGORY_CHIP,
	CATEGORY_SWATCH,
	type CategoryIndex,
	UNCATEGORIZED_CHIP,
} from "./calendar-data";
import { type CalendarSearch, pickCalendarSearch } from "./calendar-search";

/** Below this, a block only has room for its duration. */
const COMPACT_MINUTES = 30;
const MAX_EXTRA_SWATCHES = 3;

const percent = (minutes: number) => `${(minutes / MINUTES_PER_DAY) * 100}%`;

interface EntryBlockProps {
	categories: CategoryIndex;
	hidden: ReadonlySet<string>;
	locale: string;
	positioned: PositionedEntry<CalendarEntry>;
	search: CalendarSearch;
}

/**
 * One entry on the time grid. The first visible category fills the block
 * (its fg/bg token pair keeps the duration readable); any others show as
 * small swatches, and every name is in the accessible label.
 */
function EntryBlockView({
	categories,
	hidden,
	locale,
	positioned,
	search,
}: EntryBlockProps) {
	const { column, columns, entry } = positioned;
	const categoryIds = orderedCategories(entry, categories.order, hidden);
	const primary = categoryIds[0]
		? categories.byId.get(categoryIds[0])
		: undefined;
	const extras = categoryIds
		.slice(1, MAX_EXTRA_SWATCHES + 1)
		.map((id) => categories.byId.get(id))
		.filter((category) => category !== undefined);
	const compact = entry.minutesWorked < COMPACT_MINUTES;
	const names = categoryIds
		.map((id) => categories.byId.get(id)?.name)
		.filter(Boolean)
		.join(", ");

	return (
		<Link
			className={cn(
				"absolute flex min-h-0 touch-manipulation overflow-hidden rounded-sm border-2 border-border px-1.5 text-left shadow-brutal-sm outline-none transition-[transform,box-shadow] duration-150 hover:z-10 hover:shadow-brutal focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none",
				compact ? "items-center gap-1" : "flex-col gap-0.5 py-1",
				primary ? CATEGORY_CHIP[primary.color] : UNCATEGORIZED_CHIP
			)}
			params={{ entryId: entry.id }}
			search={pickCalendarSearch(search)}
			style={{
				height: percent(entry.endMinute - entry.startMinute),
				left: `calc(${(column / columns) * 100}% + 1px)`,
				top: percent(entry.startMinute),
				width: `calc(${100 / columns}% - 4px)`,
			}}
			to="/calendar/entries/$entryId"
		>
			{/* The visible duration and description stay in the accessible name
			    (WCAG 2.5.3); the time range and categories lead it, for screen
			    readers only: "10:30 to 11:30, Categories: A, B, 1h Client sync". */}
			<span className="sr-only">
				{m.calendar_entry_time({
					end: minuteToLabel(entry.endMinute, locale),
					start: minuteToLabel(entry.startMinute, locale),
				})}
				, {names ? `${m.calendar_entry_categories({ names })}, ` : null}
			</span>
			<span className="flex items-center gap-1">
				<span className="font-bold font-mono text-[11px] tabular-nums leading-none">
					{formatMinutes(entry.minutesWorked)}
				</span>
				{extras.length > 0 ? (
					<span aria-hidden="true" className="ml-auto flex gap-0.5">
						{extras.map((category) => (
							<span
								className={cn(
									"size-2 rounded-[2px] border border-current",
									CATEGORY_SWATCH[category.color]
								)}
								key={category.id}
							/>
						))}
					</span>
				) : null}
			</span>
			{!compact && entry.description ? (
				<span className="line-clamp-2 hyphens-auto break-words text-[11px] leading-tight">
					{entry.description}
				</span>
			) : null}
		</Link>
	);
}

export const EntryBlock = memo(EntryBlockView);

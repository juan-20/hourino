/*
 * Pure logic behind the /calendar page: date windows per view, overlap layout
 * for the time grid, and per-day totals. No React, no fetching. Dates are
 * local `YYYY-MM-DD` strings and times are minutes from local midnight, the
 * same wall-clock model the API stores.
 */

import { fromIsoDate, toIsoDate } from "./time-format";

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const MINUTES_PER_DAY = 1440;
/** Click-to-create snaps to this grid. */
export const SLOT_MINUTES = 15;
/** Length of an entry created by clicking an empty slot. */
export const DEFAULT_ENTRY_MINUTES = 60;
const DAYS_PER_WEEK = 7;
const MONTH_GRID_DAYS = 42;

/** Sentinel in the `hidden` filter list meaning "hide entries without a category". */
export const UNCATEGORIZED = "none";

/** Adds whole calendar days. Goes through local `Date` parts, so DST never skips or repeats a day. */
export function addDays(isoDate: string, days: number): string {
	const date = fromIsoDate(isoDate);
	return toIsoDate(
		new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
	);
}

/** Sunday on or before `isoDate` (Sunday-first weeks, matching the landing demo). */
export function startOfWeek(isoDate: string): string {
	return addDays(isoDate, -fromIsoDate(isoDate).getDay());
}

/** The 7 days of the week containing `isoDate`. */
export function weekDays(isoDate: string): string[] {
	const start = startOfWeek(isoDate);
	return Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(start, i));
}

export function startOfMonth(isoDate: string): string {
	return `${isoDate.slice(0, 7)}-01`;
}

/** The 42 days (6 full weeks) of the month grid that contains `isoDate`. */
export function monthGridDays(isoDate: string): string[] {
	const start = startOfWeek(startOfMonth(isoDate));
	return Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDays(start, i));
}

export interface DateWindow {
	/** Inclusive. */
	from: string;
	/** Exclusive. */
	to: string;
}

/**
 * The fetch window for a view. Day and week share the week window so
 * switching between them hits the same cache entry; month uses the full
 * 6-week grid (42 days, exactly the API's maximum range).
 */
export function windowFor(view: CalendarView, isoDate: string): DateWindow {
	if (view === "month") {
		const start = startOfWeek(startOfMonth(isoDate));
		return { from: start, to: addDays(start, MONTH_GRID_DAYS) };
	}
	const from = startOfWeek(isoDate);
	return { from, to: addDays(from, DAYS_PER_WEEK) };
}

/** The days a view's period total counts: one day, the week, or the days inside the month. */
export function periodDays(view: CalendarView, isoDate: string): string[] {
	if (view === "day") {
		return [isoDate];
	}
	if (view === "week") {
		return weekDays(isoDate);
	}
	const month = isoDate.slice(0, 7);
	return monthGridDays(isoDate).filter((day) => day.startsWith(month));
}

/** Previous/next period. Month steps land on the 1st, so Jan 31 → Feb never overflows into March. */
export function shiftDate(
	view: CalendarView,
	isoDate: string,
	direction: 1 | -1
): string {
	if (view === "day") {
		return addDays(isoDate, direction);
	}
	if (view === "week") {
		return addDays(isoDate, direction * DAYS_PER_WEEK);
	}
	const date = fromIsoDate(isoDate);
	return toIsoDate(
		new Date(date.getFullYear(), date.getMonth() + direction, 1)
	);
}

/** Snaps a minute offset down to the slot grid, keeping room for a default-length entry. */
export function snapToSlot(minute: number): number {
	const snapped = Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES;
	return Math.min(
		Math.max(snapped, 0),
		MINUTES_PER_DAY - DEFAULT_ENTRY_MINUTES
	);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface CalendarEntry {
	categoryIds: string[];
	description: string | null;
	endMinute: number;
	id: string;
	minutesWorked: number;
	startMinute: number;
	workDate: string;
}

/**
 * Whether an entry passes the category filter: uncategorized entries follow
 * the `UNCATEGORIZED` switch; categorized ones stay visible while at least one
 * of their categories is shown.
 *
 * `filterable` is the set of categories that have a filter chip (the active
 * ones). A category without a chip (deleted, or not loaded) can't be toggled,
 * so it's ignored here: an entry whose only categories are chip-less counts
 * as uncategorized, which the "Uncategorized" chip can hide. Without
 * `filterable`, every category counts.
 */
export function isEntryVisible(
	entry: Pick<CalendarEntry, "categoryIds">,
	hidden: ReadonlySet<string>,
	filterable?: ReadonlySet<string>
): boolean {
	const ids = filterable
		? entry.categoryIds.filter((id) => filterable.has(id))
		: entry.categoryIds;
	if (ids.length === 0) {
		return !hidden.has(UNCATEGORIZED);
	}
	return ids.some((id) => !hidden.has(id));
}

/**
 * An entry's categories in display order (the order of `categoryOrder`, i.e.
 * the category list), skipping hidden and unknown ones. The first one is the
 * entry's "primary" category: it colors the block and owns the minutes in
 * per-category chips, so a multi-category entry is never counted twice.
 */
export function orderedCategories(
	entry: Pick<CalendarEntry, "categoryIds">,
	categoryOrder: ReadonlyMap<string, number>,
	hidden: ReadonlySet<string> = new Set()
): string[] {
	return entry.categoryIds
		.filter((id) => categoryOrder.has(id) && !hidden.has(id))
		.sort((a, b) => (categoryOrder.get(a) ?? 0) - (categoryOrder.get(b) ?? 0));
}

export interface DayTotal {
	/** Minutes per primary category id (`UNCATEGORIZED` for none), in display order. */
	byCategory: Map<string, number>;
	total: number;
}

/** Visible minutes per day, split by each entry's primary category. */
export function dayTotals(
	entries: readonly CalendarEntry[],
	categoryOrder: ReadonlyMap<string, number>,
	hidden: ReadonlySet<string>,
	filterable?: ReadonlySet<string>
): Map<string, DayTotal> {
	const totals = new Map<string, DayTotal>();
	for (const entry of entries) {
		if (!isEntryVisible(entry, hidden, filterable)) {
			continue;
		}
		const key =
			orderedCategories(entry, categoryOrder, hidden)[0] ?? UNCATEGORIZED;
		const day = totals.get(entry.workDate) ?? {
			byCategory: new Map(),
			total: 0,
		};
		day.total += entry.minutesWorked;
		day.byCategory.set(
			key,
			(day.byCategory.get(key) ?? 0) + entry.minutesWorked
		);
		totals.set(entry.workDate, day);
	}
	for (const day of totals.values()) {
		day.byCategory = new Map(
			[...day.byCategory].sort(
				([a], [b]) =>
					(categoryOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
					(categoryOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
			)
		);
	}
	return totals;
}

export interface PositionedEntry<T> {
	/** Zero-based column inside the overlap cluster. */
	column: number;
	/** Number of columns the cluster needs. */
	columns: number;
	entry: T;
}

/**
 * Google-Calendar-style side-by-side layout for one day. Entries that overlap
 * (directly or through a chain) form a cluster; each entry takes the first
 * column whose previous entry already ended, and every entry in the cluster
 * shares the cluster's column count so widths line up.
 */
export function layoutDay<
	T extends { endMinute: number; id: string; startMinute: number },
>(entries: readonly T[]): PositionedEntry<T>[] {
	const sorted = [...entries].sort(
		(a, b) =>
			a.startMinute - b.startMinute ||
			b.endMinute - a.endMinute ||
			a.id.localeCompare(b.id)
	);

	const positioned: PositionedEntry<T>[] = [];
	let cluster: PositionedEntry<T>[] = [];
	let columnEnds: number[] = [];
	let clusterEnd = Number.NEGATIVE_INFINITY;

	const closeCluster = () => {
		for (const item of cluster) {
			item.columns = columnEnds.length;
		}
		positioned.push(...cluster);
		cluster = [];
		columnEnds = [];
		clusterEnd = Number.NEGATIVE_INFINITY;
	};

	for (const entry of sorted) {
		if (entry.startMinute >= clusterEnd) {
			closeCluster();
		}
		let column = columnEnds.findIndex((end) => end <= entry.startMinute);
		if (column === -1) {
			column = columnEnds.length;
			columnEnds.push(entry.endMinute);
		} else {
			columnEnds[column] = entry.endMinute;
		}
		cluster.push({ column, columns: 0, entry });
		clusterEnd = Math.max(clusterEnd, entry.endMinute);
	}
	closeCluster();
	return positioned;
}

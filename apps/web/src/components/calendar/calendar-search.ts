import { useMemo, useState, useSyncExternalStore } from "react";
import { z } from "zod";

import { CALENDAR_VIEWS, type CalendarView } from "@/lib/calendar";
import { toIsoDate } from "@/lib/time-format";

/**
 * URL state for /calendar and its dialog children. Every key is optional and
 * falls back instead of throwing, so a hand-edited or stale URL still opens
 * the calendar. Defaults are resolved in `useCalendarState`, which keeps
 * shared URLs short (`/calendar` alone means "this week").
 */
export const calendarSearchSchema = z.object({
	date: z.iso.date().optional().catch(undefined),
	/** Category ids filtered out; `"none"` hides uncategorized entries. */
	hidden: z.array(z.string()).optional().catch(undefined),
	view: z.enum(CALENDAR_VIEWS).optional().catch(undefined),
});

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** Only the calendar's own keys: dialog-specific params never leak into links. */
export function pickCalendarSearch(search: CalendarSearch): CalendarSearch {
	return { date: search.date, hidden: search.hidden, view: search.view };
}

const NARROW_QUERY = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
	const media = window.matchMedia(NARROW_QUERY);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

const isNarrowNow = () => window.matchMedia(NARROW_QUERY).matches;

/** Below `md` the default view is Day: seven columns don't fit a phone. */
export function useIsNarrow(): boolean {
	return useSyncExternalStore(subscribeNarrow, isNarrowNow, () => false);
}

const VIEW_STORAGE_KEY = "hourino.calendar.view";
const UNREAD = Symbol("unread");
let cachedView: CalendarView | undefined | typeof UNREAD = UNREAD;

/**
 * The Day/Week/Month choice the user last made in the view switcher. It's a
 * per-browser convenience: storage can be blocked or cleared (private
 * windows, site-data settings), so every access is guarded and a missing
 * value just falls back to the viewport default.
 */
export function readStoredView(): CalendarView | undefined {
	// Read storage once; resolveView runs on every render.
	if (cachedView === UNREAD) {
		try {
			const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
			cachedView = CALENDAR_VIEWS.find((view) => view === value);
		} catch {
			cachedView = undefined;
		}
	}
	return cachedView;
}

/** Remembers an explicit view choice (called from the view switcher). */
export function storeView(view: CalendarView): void {
	cachedView = view;
	try {
		window.localStorage.setItem(VIEW_STORAGE_KEY, view);
	} catch {
		// Storage unavailable: the choice still holds for this page load.
	}
}

/** URL view first, then the remembered choice, then Day on phones / Week. */
export function resolveView(
	urlView: CalendarView | undefined,
	isNarrow: boolean
): CalendarView {
	return urlView ?? readStoredView() ?? (isNarrow ? "day" : "week");
}

const EMPTY_HIDDEN: readonly string[] = [];

export interface CalendarState {
	date: string;
	hidden: ReadonlySet<string>;
	today: string;
	view: CalendarView;
}

export function useCalendarState(search: CalendarSearch): CalendarState {
	const isNarrow = useIsNarrow();
	// Fixed for the page's lifetime; a calendar left open past midnight keeps
	// its "today" until reload, like the landing demo.
	const [today] = useState(() => toIsoDate(new Date()));
	const hiddenList = search.hidden ?? EMPTY_HIDDEN;
	const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);

	return {
		date: search.date ?? today,
		hidden,
		today,
		view: resolveView(search.view, isNarrow),
	};
}

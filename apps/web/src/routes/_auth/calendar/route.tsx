import { Button } from "@hourino/ui/components/button";
import { Skeleton } from "@hourino/ui/components/skeleton";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";

import {
	categoriesQueryOptions,
	entriesQueryOptions,
	useCategoryIndex,
	useWindowEntries,
} from "@/components/calendar/calendar-data";
import {
	CategoryFilters,
	PeriodTotal,
} from "@/components/calendar/calendar-filters";
import {
	calendarSearchSchema,
	resolveView,
	useCalendarState,
	useIsNarrow,
} from "@/components/calendar/calendar-search";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { MonthGrid } from "@/components/calendar/month-grid";
import { TimeGrid, useGridFormats } from "@/components/calendar/time-grid";
import {
	type CalendarView,
	DEFAULT_ENTRY_MINUTES,
	dayTotals,
	isEntryVisible,
	monthGridDays,
	periodDays,
	weekDays,
} from "@/lib/calendar";
import {
	formatMinutes,
	formatMinutesLong,
	fromIsoDate,
	toIsoDate,
} from "@/lib/time-format";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/_auth/calendar")({
	// Key order matters for inference: validateSearch → loaderDeps → loader.
	validateSearch: (search) => calendarSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({ date: search.date, view: search.view }),
	// Start both requests while the route chunk loads, without awaiting them:
	// the page shows its own skeleton instead of the global loader.
	loader: ({ context: { queryClient }, deps }) => {
		queryClient.prefetchQuery(categoriesQueryOptions());
		const narrow = window.matchMedia("(max-width: 767px)").matches;
		queryClient.prefetchQuery(
			entriesQueryOptions(
				resolveView(deps.view, narrow),
				deps.date ?? toIsoDate(new Date())
			)
		);
	},
	head: () => ({ meta: [{ title: `${m.calendar_title()} | hourino` }] }),
	component: CalendarLayout,
});

/** 09:00, where a new entry from a month-view day starts (not today). */
const MONTH_DEFAULT_START = 540;

const TOTAL_LABEL: Record<CalendarView, () => string> = {
	day: m.calendar_total_day,
	month: m.calendar_total_month,
	week: m.calendar_total_week,
};

/** Sentence-case only the first letter: pt-BR gives "setembro de 2026", and CSS `capitalize` would wrongly produce "Setembro De 2026". */
function sentenceCase(value: string, locale: string): string {
	return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

function usePeriodLabel(view: CalendarView, date: string, locale: string) {
	return useMemo(() => {
		const day = fromIsoDate(date);
		if (view === "day") {
			return sentenceCase(
				new Intl.DateTimeFormat(locale, {
					day: "numeric",
					month: "long",
					weekday: "long",
					year: "numeric",
				}).format(day),
				locale
			);
		}
		if (view === "month") {
			return sentenceCase(
				new Intl.DateTimeFormat(locale, {
					month: "long",
					year: "numeric",
				}).format(day),
				locale
			);
		}
		const days = weekDays(date);
		const range = new Intl.DateTimeFormat(locale, {
			day: "numeric",
			month: "short",
			year: "numeric",
		}).formatRange(fromIsoDate(days[0]), fromIsoDate(days[6]));
		// Intl joins ranges with an en dash; the brand copy uses plain hyphens.
		return range.replace(/\s?[–—]\s?/g, " - ");
	}, [view, date, locale]);
}

function CalendarLayout() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { date, hidden, today, view } = useCalendarState(search);
	const isNarrow = useIsNarrow();
	const locale = getLocale();
	const formats = useGridFormats(locale);
	const periodLabel = usePeriodLabel(view, date, locale);

	const { index: categories } = useCategoryIndex();
	const { entries, query } = useWindowEntries(view, date);

	// Only categories with a filter chip take part in filtering, so an entry
	// whose categories were all deleted is hidden by the "Uncategorized" chip.
	const visibleEntries = useMemo(
		() =>
			entries.filter((entry) =>
				isEntryVisible(entry, hidden, categories.filterable)
			),
		[entries, hidden, categories.filterable]
	);
	const totals = useMemo(
		() => dayTotals(entries, categories.order, hidden, categories.filterable),
		[entries, categories.order, hidden, categories.filterable]
	);
	// The previous window stays on screen while the next one loads
	// (placeholder data). The grid's auto-scroll must wait for this window's
	// own entries, or it scrolls for last week and never runs again.
	const windowSettled = query.isSuccess && !query.isPlaceholderData;
	const periodTotal = periodDays(view, date).reduce(
		(sum, day) => sum + (totals.get(day)?.total ?? 0),
		0
	);

	const setHidden = useCallback(
		(next: string[]) =>
			navigate({
				replace: true,
				search: (prev) => ({
					...prev,
					hidden: next.length > 0 ? next : undefined,
				}),
				to: "/calendar",
			}),
		[navigate]
	);
	const toggleCategory = useCallback(
		(id: string) =>
			setHidden(
				hidden.has(id)
					? [...hidden].filter((value) => value !== id)
					: [...hidden, id]
			),
		[hidden, setHidden]
	);
	const resetFilters = useCallback(() => setHidden([]), [setHidden]);
	// Month view: a day opens the new-entry dialog for that day right away
	// (the next full hour today, otherwise 09:00), keeping the month on screen.
	const openDay = useCallback(
		(isoDate: string) => {
			const start =
				isoDate === today
					? Math.min(new Date().getHours() + 1, 23) * 60
					: MONTH_DEFAULT_START;
			navigate({
				search: (prev) => ({
					...prev,
					end: start + DEFAULT_ENTRY_MINUTES,
					start,
					workDate: isoDate,
				}),
				to: "/calendar/entries/new",
			});
		},
		[navigate, today]
	);

	const filters = (
		<CategoryFilters
			categories={categories}
			hidden={hidden}
			onReset={resetFilters}
			onToggle={toggleCategory}
		/>
	);
	const isLoading = query.isPending;

	return (
		<div className="grid min-h-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
			<aside className="hidden min-h-0 flex-col gap-6 overflow-y-auto border-border border-r-2 p-4 lg:flex">
				<PeriodTotal
					label={TOTAL_LABEL[view]()}
					locale={locale}
					minutes={periodTotal}
				/>
				{filters}
			</aside>

			<main aria-busy={isLoading} className="flex min-h-0 min-w-0 flex-col">
				<CalendarToolbar
					date={date}
					filters={filters}
					hiddenCount={hidden.size}
					periodLabel={periodLabel}
					search={search}
					today={today}
					view={view}
				/>
				<StatusLine
					filteredOut={entries.length > 0 && visibleEntries.length === 0}
					isEmpty={entries.length === 0}
					isError={query.isError && !query.data}
					isLoading={isLoading}
					onRetry={() => query.refetch()}
					total={
						<span className="lg:hidden">
							<span className="text-muted-foreground">
								{TOTAL_LABEL[view]()}:{" "}
							</span>
							<span
								aria-hidden="true"
								className="font-bold font-mono tabular-nums"
							>
								{formatMinutes(periodTotal)}
							</span>
							<span className="sr-only">
								{formatMinutesLong(periodTotal, locale)}
							</span>
						</span>
					}
				/>
				{view === "month" ? (
					<MonthGrid
						categories={categories}
						days={monthGridDays(date)}
						formats={formats}
						isNarrow={isNarrow}
						locale={locale}
						month={date.slice(0, 7)}
						monthLabel={periodLabel}
						onOpenDay={openDay}
						selected={date}
						today={today}
						totals={totals}
					/>
				) : (
					<TimeGrid
						categories={categories}
						days={view === "day" ? [date] : weekDays(date)}
						entries={visibleEntries}
						formats={formats}
						hidden={hidden}
						isLoading={!windowSettled}
						locale={locale}
						search={search}
						today={today}
						totals={totals}
					/>
				)}
			</main>

			<Outlet />
		</div>
	);
}

/** One quiet line under the toolbar: loading, error, empty hints, and the mobile total. */
function StatusLine({
	filteredOut,
	isEmpty,
	isError,
	isLoading,
	onRetry,
	total,
}: {
	filteredOut: boolean;
	isEmpty: boolean;
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	total: ReactNode;
}) {
	let message: ReactNode = null;
	if (isLoading) {
		message = (
			<>
				<Skeleton aria-hidden="true" className="h-3.5 w-48" />
				<span className="sr-only" role="status">
					{m.calendar_loading()}
				</span>
			</>
		);
	} else if (isError) {
		message = (
			<span className="flex items-center gap-2 text-destructive" role="alert">
				{m.calendar_load_error()}
				<Button onClick={onRetry} size="xs" variant="outline">
					{m.calendar_retry()}
				</Button>
			</span>
		);
	} else if (filteredOut) {
		message = (
			<span className="text-muted-foreground">
				{m.calendar_empty_filtered()}
			</span>
		);
	} else if (isEmpty) {
		message = (
			<span className="text-muted-foreground">{m.calendar_empty()}</span>
		);
	}

	return (
		<div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pb-2 text-xs sm:px-4">
			<div className="flex items-center">{message}</div>
			{total}
		</div>
	);
}

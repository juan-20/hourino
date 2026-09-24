import { buttonVariants } from "@hourino/ui/components/button";
import { cn } from "@hourino/ui/lib/utils";
import { Link, useMatch, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
	type CSSProperties,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	type CalendarEntry,
	type DayTotal,
	DEFAULT_ENTRY_MINUTES,
	layoutDay,
	MINUTES_PER_DAY,
} from "@/lib/calendar";
import {
	formatMinutes,
	formatMinutesLong,
	fromIsoDate,
	minuteToLabel,
} from "@/lib/time-format";
import { m } from "@/paraglide/messages";

import type { CategoryIndex } from "./calendar-data";
import { type CalendarSearch, pickCalendarSearch } from "./calendar-search";
import { EntryBlock } from "./entry-block";
import { type SweepRange, useSweep } from "./use-sweep";

const HOUR_HEIGHT_REM = 3;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const GRID_HEIGHT = `${HOURS.length * HOUR_HEIGHT_REM}rem`;
/** Keyboard path ("Add entry on …") starts at 09:00; the dialog adjusts it. */
const DEFAULT_START_MINUTE = 540;
/** Without entries, open the grid scrolled to the working day. */
const DEFAULT_SCROLL_MINUTE = 7 * 60;
const NOW_TICK_MS = 60_000;

/** Sweep ghost: a riso overprint in the focus-blue ink (hatched + tinted). */
const GHOST_STYLE: CSSProperties = {
	background:
		"repeating-linear-gradient(135deg, color-mix(in oklch, var(--ring) 28%, transparent) 0 5px, transparent 5px 10px), color-mix(in oklch, var(--ring) 12%, transparent)",
};
const GHOST_CLASS =
	"group pointer-events-none absolute inset-x-0.5 z-20 rounded-sm border-2 border-ring";
// The tag sits above the ghost, or below it when the range starts near midnight.
const GHOST_TAG_CLASS =
	"absolute bottom-full left-[-2px] mb-1 inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-[3px] bg-primary px-1.5 py-0.5 font-bold font-mono text-[11px] text-primary-foreground shadow-brutal-sm group-data-[flip=true]:top-full group-data-[flip=true]:bottom-auto group-data-[flip=true]:mt-1 group-data-[flip=true]:mb-0";
const percentOfDay = (minutes: number) =>
	`${(minutes / MINUTES_PER_DAY) * 100}%`;

// Hour lines as one background instead of 24 divs per column.
const HOUR_LINES =
	"[background-image:linear-gradient(to_bottom,color-mix(in_oklch,var(--border)_25%,transparent)_1px,transparent_1px)] [background-size:100%_3rem]";

/** `document.activeViewTransition` (Chromium 133+); not in TS's DOM lib yet. */
type ViewTransitionDocument = Document & {
	activeViewTransition?: { finished: Promise<void> } | null;
};

export interface GridFormats {
	dayNumber: Intl.DateTimeFormat;
	long: Intl.DateTimeFormat;
	weekday: Intl.DateTimeFormat;
}

/** Formatters the grids need, built once per locale. */
export function useGridFormats(locale: string): GridFormats {
	return useMemo(
		() => ({
			dayNumber: new Intl.DateTimeFormat(locale, { day: "numeric" }),
			long: new Intl.DateTimeFormat(locale, {
				day: "numeric",
				month: "long",
				weekday: "long",
			}),
			weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
		}),
		[locale]
	);
}

interface TimeGridProps {
	categories: CategoryIndex;
	days: string[];
	/** Already filtered by the category filter. */
	entries: CalendarEntry[];
	formats: GridFormats;
	hidden: ReadonlySet<string>;
	isLoading: boolean;
	locale: string;
	search: CalendarSearch;
	today: string;
	totals: ReadonlyMap<string, DayTotal>;
}

/** Day and Week views: a 24h grid with one column per day. */
export function TimeGrid({
	categories,
	days,
	entries,
	formats,
	hidden,
	isLoading,
	locale,
	search,
	today,
	totals,
}: TimeGridProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	const byDay = useMemo(() => {
		const map = new Map<string, CalendarEntry[]>();
		for (const entry of entries) {
			const list = map.get(entry.workDate);
			if (list) {
				list.push(entry);
			} else {
				map.set(entry.workDate, [entry]);
			}
		}
		return map;
	}, [entries]);

	// Scroll once per window, after its data arrives: to an hour before the
	// earliest entry, or to the morning when the window is empty.
	const scrolledFor = useRef<string | null>(null);
	const [firstDay] = days;
	useEffect(() => {
		const container = scrollRef.current;
		if (isLoading || !container || scrolledFor.current === firstDay) {
			return;
		}
		scrolledFor.current = firstDay;
		let earliest = DEFAULT_SCROLL_MINUTE + 60;
		for (const entry of entries) {
			earliest = Math.min(earliest, entry.startMinute);
		}
		const minute = Math.max(earliest - 60, 0);
		const target = (minute / MINUTES_PER_DAY) * container.scrollHeight;
		const before = container.scrollTop;
		container.scrollTop = target;
		// During a Previous/Next view transition the assignment above doesn't
		// stick (the grid keeps the old scroll), so apply it again once the
		// transition finishes, unless the user has scrolled in the meantime.
		const transition = (document as ViewTransitionDocument)
			.activeViewTransition;
		transition?.finished.finally(() => {
			if (container.scrollTop === before) {
				container.scrollTop = target;
			}
		});
	}, [isLoading, firstDay, entries]);

	// Release (or a plain click) opens the same new-entry dialog route as the
	// "+" links, with the swept range prefilled.
	const openNew = useCallback(
		(workDate: string, range: SweepRange) => {
			navigate({
				search: {
					...pickCalendarSearch(search),
					end: range.end,
					start: range.start,
					workDate,
				},
				to: "/calendar/entries/new",
			});
		},
		[navigate, search]
	);

	// Live ghost, painted straight to the DOM so a sweep never re-renders the
	// grid; the sr-only line announces the range as it changes.
	const paintSweep = useCallback(
		(container: HTMLElement, day: string, range: SweepRange | null) => {
			for (const ghost of container.querySelectorAll<HTMLElement>(
				"[data-sweep-ghost]"
			)) {
				const active = range !== null && ghost.dataset.sweepGhost === day;
				ghost.hidden = !active;
				if (active) {
					ghost.style.top = percentOfDay(range.start);
					ghost.style.height = percentOfDay(range.end - range.start);
					ghost.dataset.flip = String(range.start < 60);
					const [label, length] = ghost.querySelectorAll("span span");
					label.textContent = `${minuteToLabel(range.start, locale)} - ${minuteToLabel(range.end, locale)}`;
					length.textContent = formatMinutes(range.end - range.start);
				}
			}
			for (const bar of container.querySelectorAll<HTMLElement>(
				"[data-sweep-gutter]"
			)) {
				bar.hidden = range === null;
				if (range) {
					bar.style.top = percentOfDay(range.start);
					bar.style.height = percentOfDay(range.end - range.start);
				}
			}
			for (const live of container.querySelectorAll("[data-sweep-live]")) {
				live.textContent = range
					? m.calendar_sweep_status({
							day: formats.long.format(fromIsoDate(day)),
							duration: formatMinutesLong(range.end - range.start, locale),
							end: minuteToLabel(range.end, locale),
							start: minuteToLabel(range.start, locale),
						})
					: "";
			}
		},
		[formats, locale]
	);
	useSweep({ onCommit: openNew, onPaint: paintSweep, scrollRef });

	// While the new-entry dialog is open, its range stays on the grid as a
	// solid ghost, read from that route's URL (so click, sweep and "+" match).
	const newEntry = useMatch({
		from: "/_auth/calendar/entries/new",
		shouldThrow: false,
	});
	const heldSearch = newEntry?.search;
	const held =
		heldSearch?.workDate &&
		heldSearch.start !== undefined &&
		heldSearch.end !== undefined &&
		heldSearch.end > heldSearch.start
			? {
					day: heldSearch.workDate,
					end: heldSearch.end,
					start: heldSearch.start,
				}
			: undefined;

	// Week columns keep a minimum width, so phones scroll sideways instead of
	// squeezing seven days into 375px.
	const columns = `4rem repeat(${days.length}, minmax(${days.length > 1 ? "6.5rem" : "0"}, 1fr))`;

	return (
		<div
			className={cn(
				"relative min-h-0 flex-1 overflow-auto overscroll-contain border-border border-t-2 [view-transition-name:calendar-grid]",
				// Week on a phone scrolls sideways: settle on a day boundary, just
				// right of the sticky 4rem hour gutter. Proximity (not mandatory)
				// so vertical scrolling is never fought.
				days.length > 1 && "snap-x snap-proximity scroll-pl-16"
			)}
			ref={scrollRef}
		>
			<div className="grid min-w-full" style={{ gridTemplateColumns: columns }}>
				{/* Header row, sticky over the scrolling hours. */}
				<div
					className="sticky top-0 left-0 z-30 border-border border-r-2 border-b-2 bg-background"
					data-sweep-header
				/>
				{days.map((day) => (
					<DayHeader
						day={day}
						formats={formats}
						isToday={day === today}
						key={day}
						locale={locale}
						search={search}
						total={totals.get(day)?.total ?? 0}
					/>
				))}

				{/* Hour gutter. */}
				<div
					aria-hidden="true"
					className="sticky left-0 z-20 border-border border-r-2 bg-background"
					style={{ height: GRID_HEIGHT }}
				>
					<div className="relative h-full">
						<span
							className="absolute right-0 w-1 bg-ring"
							data-sweep-gutter
							hidden
						/>
						{held && days.includes(held.day) ? (
							<span
								className="absolute right-0 w-1 bg-ring"
								style={{
									height: percentOfDay(held.end - held.start),
									top: percentOfDay(held.start),
								}}
							/>
						) : null}
						{HOURS.map((hour) =>
							hour === 0 ? null : (
								<span
									className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground tabular-nums"
									key={hour}
									style={{ top: `${hour * HOUR_HEIGHT_REM}rem` }}
								>
									{minuteToLabel(hour * 60, locale)}
								</span>
							)
						)}
					</div>
				</div>

				{days.map((day) => (
					<DayColumn
						categories={categories}
						day={day}
						entries={byDay.get(day)}
						heldEnd={held?.day === day ? held.end : undefined}
						heldStart={held?.day === day ? held.start : undefined}
						hidden={hidden}
						isToday={day === today}
						key={day}
						locale={locale}
						search={search}
					/>
				))}
			</div>
			<p aria-live="polite" className="sr-only" data-sweep-live />
		</div>
	);
}

interface DayHeaderProps {
	day: string;
	formats: GridFormats;
	isToday: boolean;
	locale: string;
	search: CalendarSearch;
	total: number;
}

function DayHeaderView({
	day,
	formats,
	isToday,
	locale,
	search,
	total,
}: DayHeaderProps) {
	const date = fromIsoDate(day);
	return (
		<div className="sticky top-0 z-20 flex snap-start items-center gap-1.5 border-border border-b-2 bg-background px-2 py-1.5">
			<div className="flex min-w-0 flex-col leading-none">
				<span className="text-[11px] text-muted-foreground capitalize">
					{formats.weekday.format(date).replace(".", "")}
				</span>
				<span
					className={cn(
						"mt-0.5 w-fit font-bold font-mono text-sm tabular-nums",
						isToday &&
							"rounded-sm border-2 border-border bg-primary px-1 text-primary-foreground"
					)}
				>
					{formats.dayNumber.format(date)}
					{isToday ? (
						<span className="sr-only">, {m.calendar_today_marker()}</span>
					) : null}
				</span>
			</div>
			{total > 0 ? (
				<span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
					<span aria-hidden="true">{formatMinutes(total)}</span>
					<span className="sr-only">{formatMinutesLong(total, locale)}</span>
				</span>
			) : null}
			<Link
				className={cn(
					buttonVariants({ size: "icon-xs", variant: "ghost" }),
					total > 0 ? "" : "ml-auto"
				)}
				search={{
					...pickCalendarSearch(search),
					end: DEFAULT_START_MINUTE + DEFAULT_ENTRY_MINUTES,
					start: DEFAULT_START_MINUTE,
					workDate: day,
				}}
				to="/calendar/entries/new"
			>
				<PlusIcon aria-hidden="true" />
				<span className="sr-only">
					{m.calendar_add_on_day({ day: formats.long.format(date) })}
				</span>
			</Link>
		</div>
	);
}

const DayHeader = memo(DayHeaderView);

interface DayColumnProps {
	categories: CategoryIndex;
	day: string;
	entries: CalendarEntry[] | undefined;
	/** The open new-entry dialog's range, when it's on this day. */
	heldEnd?: number;
	heldStart?: number;
	hidden: ReadonlySet<string>;
	isToday: boolean;
	locale: string;
	search: CalendarSearch;
}

function DayColumnView({
	categories,
	day,
	entries,
	heldEnd,
	heldStart,
	hidden,
	isToday,
	locale,
	search,
}: DayColumnProps) {
	const positioned = useMemo(() => layoutDay(entries ?? []), [entries]);

	// Presses on the empty column are handled by useSweep (drag to sweep a
	// range, click for a 1h slot); the day header's "Add entry" link is the
	// keyboard path. Entry blocks are links of their own.
	return (
		<div
			className={cn(
				"relative cursor-cell touch-manipulation select-none border-border/40 border-r",
				HOUR_LINES,
				isToday && "bg-accent/25"
			)}
			data-sweep-day={day}
			style={{ height: GRID_HEIGHT }}
		>
			{positioned.map((item) => (
				<EntryBlock
					categories={categories}
					hidden={hidden}
					key={item.entry.id}
					locale={locale}
					positioned={item}
					search={search}
				/>
			))}
			{isToday ? <NowLine /> : null}
			{heldStart !== undefined && heldEnd !== undefined ? (
				<div
					aria-hidden="true"
					className={GHOST_CLASS}
					data-flip={heldStart < 60}
					style={{
						...GHOST_STYLE,
						height: percentOfDay(heldEnd - heldStart),
						top: percentOfDay(heldStart),
					}}
				>
					<span className={GHOST_TAG_CLASS}>
						<span>
							{minuteToLabel(heldStart, locale)} -{" "}
							{minuteToLabel(heldEnd, locale)}
						</span>
						<span className="font-normal opacity-85">
							{formatMinutes(heldEnd - heldStart)}
						</span>
					</span>
				</div>
			) : null}
			{/* Live sweep ghost: painted imperatively through useSweep's onPaint. */}
			<div
				aria-hidden="true"
				className={cn(GHOST_CLASS, "border-dashed")}
				data-sweep-ghost={day}
				hidden
				style={GHOST_STYLE}
			>
				<span className={GHOST_TAG_CLASS}>
					<span />
					<span className="font-normal opacity-85" />
				</span>
			</div>
		</div>
	);
}

const DayColumn = memo(DayColumnView);

function currentMinute(): number {
	const now = new Date();
	return now.getHours() * 60 + now.getMinutes();
}

/** Current-time marker. Owns its own clock so the grid never re-renders for it. */
function NowLineView() {
	const [minute, setMinute] = useState(currentMinute);
	useEffect(() => {
		const timer = window.setInterval(
			() => setMinute(currentMinute()),
			NOW_TICK_MS
		);
		return () => window.clearInterval(timer);
	}, []);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-ring"
			style={{ top: `${(minute / MINUTES_PER_DAY) * 100}%` }}
		>
			<span className="absolute -top-1 -left-1 size-2.5 rounded-full border-2 border-background bg-ring" />
		</div>
	);
}

const NowLine = memo(NowLineView);

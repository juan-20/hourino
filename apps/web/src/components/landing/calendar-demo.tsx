import { Button } from "@hourino/ui/components/button";
import { Card } from "@hourino/ui/components/card";
import { cn } from "@hourino/ui/lib/utils";
import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";

import {
	addMinutes,
	buildMonthMatrix,
	CATEGORY_IDS,
	type CategoryId,
	type DayEntries,
	dayTotal,
	formatMinutes,
	formatMinutesLong,
	type MonthEntries,
	monthTotal,
	QUICK_ADD_MINUTES,
	seedMonth,
	toIsoDate,
} from "@/lib/calendar-demo";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// Literal class names so Tailwind can see them; chart tokens are decorative
// fills and always travel with a text label (DESIGN.md).
const CATEGORY_SWATCH: Record<CategoryId, string> = {
	health: "bg-chart-4",
	home: "bg-chart-3",
	leisure: "bg-chart-5",
	study: "bg-chart-2",
	work: "bg-chart-1",
};

const CATEGORY_LABEL: Record<CategoryId, () => string> = {
	health: m.category_health,
	home: m.category_home,
	leisure: m.category_leisure,
	study: m.category_study,
	work: m.category_work,
};

const KEY_DELTAS: Record<string, number> = {
	ArrowDown: 7,
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -7,
};

const FIELDSET_RESET = "m-0 min-w-0 border-0 p-0";
const PRESSED_CHIP =
	"aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:aria-pressed:bg-accent";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DemoState {
	entries: MonthEntries;
	filters: CategoryId[];
	selected: string;
}

type DemoAction =
	| { type: "add"; category: CategoryId }
	| { type: "clearDay" }
	| { type: "resetFilters" }
	| { type: "select"; isoDate: string }
	| { type: "toggleFilter"; category: CategoryId };

function reducer(state: DemoState, action: DemoAction): DemoState {
	switch (action.type) {
		case "add":
			return {
				...state,
				entries: addMinutes(
					state.entries,
					state.selected,
					action.category,
					QUICK_ADD_MINUTES
				),
				// Adding to a hidden category re-enables it, so the change is visible.
				filters: CATEGORY_IDS.filter(
					(id) => state.filters.includes(id) || id === action.category
				),
			};
		case "clearDay":
			return {
				...state,
				entries: Object.fromEntries(
					Object.entries(state.entries).filter(
						([isoDate]) => isoDate !== state.selected
					)
				),
			};
		case "resetFilters":
			return { ...state, filters: [...CATEGORY_IDS] };
		case "select":
			return { ...state, selected: action.isoDate };
		case "toggleFilter": {
			const active = state.filters.includes(action.category);
			// Keep at least one category on; an all-off filter would show an empty month.
			if (active && state.filters.length === 1) {
				return state;
			}
			return {
				...state,
				filters: CATEGORY_IDS.filter((id) =>
					id === action.category ? !active : state.filters.includes(id)
				),
			};
		}
		default:
			return state;
	}
}

function initState(today: Date): DemoState {
	return {
		entries: seedMonth(today),
		filters: [...CATEGORY_IDS],
		selected: toIsoDate(today),
	};
}

// ---------------------------------------------------------------------------
// Helpers & hooks
// ---------------------------------------------------------------------------

function fromIsoDate(isoDate: string): Date {
	const [year, month, day] = isoDate.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function categoryOf(event: MouseEvent<HTMLElement>): CategoryId {
	return event.currentTarget.dataset.category as CategoryId;
}

type DateFormats = ReturnType<typeof useDateFormats>;

/** Locale-bound `Intl` formatters, built once per locale. */
function useDateFormats(locale: string) {
	return useMemo(
		() => ({
			long: new Intl.DateTimeFormat(locale, {
				day: "numeric",
				month: "long",
				weekday: "long",
			}),
			month: new Intl.DateTimeFormat(locale, {
				month: "long",
				year: "numeric",
			}),
			short: new Intl.DateTimeFormat(locale, {
				day: "numeric",
				month: "short",
				weekday: "short",
			}),
			weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
		}),
		[locale]
	);
}

/**
 * Roving tabindex for the month grid: the grid is a single Tab stop and the
 * arrow/Home/End keys move focus between selectable days (1..today).
 */
function useRovingDayFocus(today: Date) {
	const [focusedIso, setFocusedIso] = useState(() => toIsoDate(today));
	const gridRef = useRef<HTMLFieldSetElement>(null);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			const current = fromIsoDate(event.currentTarget.dataset.date as string);
			const lastDay = today.getDate();
			let target: number | undefined;
			if (event.key in KEY_DELTAS) {
				target = current.getDate() + KEY_DELTAS[event.key];
			} else if (event.key === "Home") {
				target = 1;
			} else if (event.key === "End") {
				target = lastDay;
			}
			if (target === undefined) {
				return;
			}
			event.preventDefault();
			const clamped = Math.min(Math.max(target, 1), lastDay);
			const isoDate = toIsoDate(
				new Date(today.getFullYear(), today.getMonth(), clamped)
			);
			setFocusedIso(isoDate);
			gridRef.current
				?.querySelector<HTMLButtonElement>(`[data-date="${isoDate}"]`)
				?.focus();
		},
		[today]
	);

	return { focusedIso, gridRef, handleKeyDown, setFocusedIso };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Swatch({ category }: { category: CategoryId }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-2.5 shrink-0 rounded-[2px] border border-border",
				CATEGORY_SWATCH[category]
			)}
		/>
	);
}

function MonthSummary({
	label,
	locale,
	total,
}: {
	label: string;
	locale: string;
	total: number;
}) {
	return (
		<div className="flex items-end justify-between gap-4">
			<h2 className="font-bold text-lg sm:text-xl">{label}</h2>
			<p aria-live="polite" className="text-right">
				<span className="block text-muted-foreground">
					{m.demo_month_total()}
				</span>
				<span
					aria-hidden="true"
					className="font-bold font-mono text-xl tabular-nums sm:text-2xl"
				>
					{formatMinutes(total)}
				</span>
				<span className="sr-only">{formatMinutesLong(total, locale)}</span>
			</p>
		</div>
	);
}

function CategoryFilter({
	filters,
	onReset,
	onToggle,
}: {
	filters: readonly CategoryId[];
	onReset: () => void;
	onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
	return (
		<fieldset className={cn(FIELDSET_RESET, "flex flex-wrap gap-1.5")}>
			<legend className="sr-only">{m.demo_filter()}</legend>
			<Button
				aria-pressed={filters.length === CATEGORY_IDS.length}
				className={PRESSED_CHIP}
				onClick={onReset}
				size="sm"
				variant="outline"
			>
				{m.demo_filter_all()}
			</Button>
			{CATEGORY_IDS.map((category) => (
				<Button
					aria-pressed={filters.includes(category)}
					className={cn("text-muted-foreground", PRESSED_CHIP)}
					data-category={category}
					key={category}
					onClick={onToggle}
					size="sm"
					variant="outline"
				>
					<Swatch category={category} />
					{CATEGORY_LABEL[category]()}
				</Button>
			))}
		</fieldset>
	);
}

interface DayCellProps {
	date: Date;
	day: DayEntries | undefined;
	filters: readonly CategoryId[];
	isFocusTarget: boolean;
	isFuture: boolean;
	isSelected: boolean;
	isToday: boolean;
	/** Full spoken name, e.g. "Tuesday, September 22, today: 8 hours". */
	label: string;
	minutes: number;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function DayCell({
	date,
	day,
	filters,
	isFocusTarget,
	isFuture,
	isSelected,
	isToday,
	label,
	minutes,
	onClick,
	onKeyDown,
}: DayCellProps) {
	return (
		<button
			aria-pressed={isFuture ? undefined : isSelected}
			className={cn(
				"flex h-12 flex-col justify-between rounded-sm border-2 p-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none sm:h-16 sm:p-1.5",
				isSelected
					? "border-border bg-accent text-accent-foreground"
					: "border-transparent bg-muted hover:border-border",
				isToday && !isSelected && "border-border border-dashed",
				isFuture &&
					"cursor-not-allowed bg-transparent text-muted-foreground hover:border-transparent"
			)}
			data-date={toIsoDate(date)}
			disabled={isFuture}
			onClick={onClick}
			onKeyDown={onKeyDown}
			tabIndex={isFocusTarget ? 0 : -1}
			type="button"
		>
			{/* Name comes from this text, not aria-label, so the spoken name
			    contains the visible day number (WCAG 2.5.3 label in name). */}
			<span className="sr-only">{label}</span>
			<span
				aria-hidden="true"
				className="font-mono text-[10px] leading-none sm:text-xs"
			>
				{date.getDate()}
			</span>
			{minutes > 0 && day ? (
				<span aria-hidden="true" className="flex flex-col gap-1">
					<span className="font-bold font-mono text-[10px] tabular-nums leading-none sm:text-xs">
						{formatMinutes(minutes)}
					</span>
					<span className="flex h-1 w-full overflow-hidden rounded-[1px] sm:h-1.5">
						{filters.map((category) =>
							day[category] ? (
								<span
									className={CATEGORY_SWATCH[category]}
									key={category}
									style={{
										width: `${((day[category] ?? 0) / minutes) * 100}%`,
									}}
								/>
							) : null
						)}
					</span>
				</span>
			) : null}
		</button>
	);
}

interface MonthGridProps {
	entries: MonthEntries;
	filters: readonly CategoryId[];
	format: DateFormats;
	locale: string;
	monthLabel: string;
	onSelect: (isoDate: string) => void;
	selected: string;
	today: Date;
}

function MonthGrid({
	entries,
	filters,
	format,
	locale,
	monthLabel,
	onSelect,
	selected,
	today,
}: MonthGridProps) {
	const { focusedIso, gridRef, handleKeyDown, setFocusedIso } =
		useRovingDayFocus(today);
	const todayIso = toIsoDate(today);
	const weeks = useMemo(() => buildMonthMatrix(today), [today]);
	// 2023-01-01 was a Sunday, matching the grid's Sunday-first columns.
	const weekdays = useMemo(
		() =>
			Array.from({ length: 7 }, (_, index) =>
				format.weekday.format(new Date(2023, 0, 1 + index))
			),
		[format]
	);

	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			const isoDate = event.currentTarget.dataset.date as string;
			setFocusedIso(isoDate);
			onSelect(isoDate);
		},
		[onSelect, setFocusedIso]
	);

	return (
		<fieldset
			className={cn(FIELDSET_RESET, "grid grid-cols-7 gap-1")}
			ref={gridRef}
		>
			<legend className="sr-only">
				{m.demo_calendar({ month: monthLabel })}
			</legend>
			{weekdays.map((weekday) => (
				<span
					aria-hidden="true"
					className="pb-1 text-center text-muted-foreground capitalize"
					key={weekday}
				>
					{weekday.replace(".", "")}
				</span>
			))}
			{weeks.flat().map((date, index) => {
				if (!date) {
					// biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no identity beyond their slot.
					return <span aria-hidden="true" key={`pad-${index}`} />;
				}
				const isoDate = toIsoDate(date);
				const day = entries[isoDate];
				const minutes = dayTotal(day, filters);
				const isToday = isoDate === todayIso;
				const spokenDate = isToday
					? `${format.long.format(date)}, ${m.demo_today()}`
					: format.long.format(date);
				const spokenTotal =
					minutes > 0
						? formatMinutesLong(minutes, locale)
						: m.demo_nothing_logged();

				return (
					<DayCell
						date={date}
						day={day}
						filters={filters}
						isFocusTarget={isoDate === focusedIso}
						isFuture={date > today && !isToday}
						isSelected={isoDate === selected}
						isToday={isToday}
						key={isoDate}
						label={`${spokenDate}: ${spokenTotal}`}
						minutes={minutes}
						onClick={handleClick}
						onKeyDown={handleKeyDown}
					/>
				);
			})}
		</fieldset>
	);
}

function QuickAdd({
	canClear,
	onAdd,
	onClear,
	selectedLabel,
}: {
	canClear: boolean;
	onAdd: (event: MouseEvent<HTMLButtonElement>) => void;
	onClear: () => void;
	selectedLabel: string;
}) {
	return (
		<div className="flex flex-col gap-2 border-border border-t-2 pt-3">
			<div className="flex items-center justify-between gap-2">
				<p className="font-medium">
					{m.demo_selected({ date: selectedLabel })}
				</p>
				<Button
					disabled={!canClear}
					onClick={onClear}
					size="xs"
					variant="ghost"
				>
					{m.demo_clear_day()}
				</Button>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{CATEGORY_IDS.map((category) => (
					<Button
						data-category={category}
						key={category}
						onClick={onAdd}
						size="sm"
						variant="secondary"
					>
						<Swatch category={category} />
						<span aria-hidden="true">
							+{QUICK_ADD_MINUTES}m {CATEGORY_LABEL[category]()}
						</span>
						<span className="sr-only">
							{m.demo_add({ category: CATEGORY_LABEL[category]() })}
						</span>
					</Button>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

/** The landing hero's playable month calendar: sample data, filters, quick-add. Nothing persists. */
export function CalendarDemo() {
	const [today] = useState(() => new Date());
	const [state, dispatch] = useReducer(reducer, today, initState);
	const locale = getLocale();
	const format = useDateFormats(locale);

	// Sentence-case only the first letter: pt-BR gives "setembro de 2026", and CSS
	// `capitalize` would wrongly turn it into "Setembro De 2026".
	const rawMonthLabel = format.month.format(today);
	const monthLabel =
		rawMonthLabel.charAt(0).toLocaleUpperCase(locale) + rawMonthLabel.slice(1);

	const handleReset = useCallback(() => dispatch({ type: "resetFilters" }), []);
	const handleClear = useCallback(() => dispatch({ type: "clearDay" }), []);
	const handleToggle = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			dispatch({ category: categoryOf(event), type: "toggleFilter" }),
		[]
	);
	const handleAdd = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			dispatch({ category: categoryOf(event), type: "add" }),
		[]
	);
	const handleSelect = useCallback(
		(isoDate: string) => dispatch({ isoDate, type: "select" }),
		[]
	);

	return (
		<section aria-label={m.demo_region()} className="relative mr-3 mb-3">
			{/* Offset spot-color plate: a riso misregistration echo of the brutal shadow. */}
			<div
				aria-hidden="true"
				className="absolute inset-0 translate-x-3 translate-y-3 rounded-lg border-2 border-border bg-accent dark:bg-primary"
			/>
			<Card className="relative gap-4 px-3 shadow-none sm:px-5">
				<MonthSummary
					label={monthLabel}
					locale={locale}
					total={monthTotal(state.entries, state.filters)}
				/>
				<CategoryFilter
					filters={state.filters}
					onReset={handleReset}
					onToggle={handleToggle}
				/>
				<MonthGrid
					entries={state.entries}
					filters={state.filters}
					format={format}
					locale={locale}
					monthLabel={monthLabel}
					onSelect={handleSelect}
					selected={state.selected}
					today={today}
				/>
				<QuickAdd
					canClear={dayTotal(state.entries[state.selected], CATEGORY_IDS) > 0}
					onAdd={handleAdd}
					onClear={handleClear}
					selectedLabel={format.short.format(fromIsoDate(state.selected))}
				/>
				<p className="text-[11px] text-muted-foreground">{m.demo_note()}</p>
			</Card>
		</section>
	);
}

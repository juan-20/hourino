import { cn } from "@hourino/ui/lib/utils";
import {
	type KeyboardEvent,
	type MouseEvent,
	memo,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

import { addDays, type DayTotal, UNCATEGORIZED } from "@/lib/calendar";
import {
	formatMinutes,
	formatMinutesLong,
	fromIsoDate,
} from "@/lib/time-format";
import { m } from "@/paraglide/messages";

import {
	CATEGORY_CHIP,
	type CategoryIndex,
	UNCATEGORIZED_CHIP,
} from "./calendar-data";
import type { GridFormats } from "./time-grid";

/** Chips per day before collapsing the rest into "+N". */
const MAX_CHIPS = 3;

const KEY_DELTAS: Record<string, number> = {
	ArrowDown: 7,
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -7,
};

const FIELDSET_RESET = "m-0 min-w-0 border-0 p-0";

interface MonthGridProps {
	categories: CategoryIndex;
	/** The 42 grid days. */
	days: string[];
	formats: GridFormats;
	isNarrow: boolean;
	locale: string;
	/** `YYYY-MM` of the month being shown; other days render muted. */
	month: string;
	monthLabel: string;
	onOpenDay: (isoDate: string) => void;
	selected: string;
	today: string;
	totals: ReadonlyMap<string, DayTotal>;
}

/**
 * Month view: daily totals as category-colored duration chips (the color is
 * the background behind the number). One Tab stop; arrows/Home/End move
 * between days; Enter or click opens the new-entry dialog for that day.
 */
export function MonthGrid({
	categories,
	days,
	formats,
	isNarrow,
	locale,
	month,
	monthLabel,
	onOpenDay,
	selected,
	today,
	totals,
}: MonthGridProps) {
	const gridRef = useRef<HTMLFieldSetElement>(null);
	const initialFocus = days.includes(selected) ? selected : days[0];
	const [focused, setFocused] = useState(initialFocus);
	const focusTarget = days.includes(focused) ? focused : initialFocus;

	// Sunday-first columns: take the weekday names from the first grid week.
	const weekdays = useMemo(
		() =>
			days
				.slice(0, 7)
				.map((day) =>
					formats.weekday.format(fromIsoDate(day)).replace(".", "")
				),
		[days, formats]
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			const current = event.currentTarget.dataset.date as string;
			let target: string | undefined;
			if (event.key in KEY_DELTAS) {
				target = addDays(current, KEY_DELTAS[event.key]);
			} else if (event.key === "Home") {
				[target] = days;
			} else if (event.key === "End") {
				target = days.at(-1);
			}
			if (!(target && days.includes(target))) {
				return;
			}
			event.preventDefault();
			setFocused(target);
			gridRef.current
				?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)
				?.focus();
		},
		[days]
	);

	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			onOpenDay(event.currentTarget.dataset.date as string);
		},
		[onOpenDay]
	);

	return (
		<div className="min-h-0 flex-1 overflow-auto border-border border-t-2 p-2 [view-transition-name:calendar-grid] sm:p-3">
			<fieldset
				className={cn(
					FIELDSET_RESET,
					"grid h-full min-h-[28rem] grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-1"
				)}
				ref={gridRef}
			>
				<legend className="sr-only">
					{m.calendar_grid({ period: monthLabel })}
				</legend>
				{weekdays.map((weekday) => (
					<span
						aria-hidden="true"
						className="pb-1 text-center text-[11px] text-muted-foreground capitalize"
						key={weekday}
					>
						{weekday}
					</span>
				))}
				{days.map((day) => (
					<MonthCell
						categories={categories}
						day={day}
						formats={formats}
						inMonth={day.startsWith(month)}
						isFocusTarget={day === focusTarget}
						isNarrow={isNarrow}
						isToday={day === today}
						key={day}
						locale={locale}
						onClick={handleClick}
						onKeyDown={handleKeyDown}
						total={totals.get(day)}
					/>
				))}
			</fieldset>
		</div>
	);
}

interface MonthCellProps {
	categories: CategoryIndex;
	day: string;
	formats: GridFormats;
	inMonth: boolean;
	isFocusTarget: boolean;
	isNarrow: boolean;
	isToday: boolean;
	locale: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
	total: DayTotal | undefined;
}

function MonthCellView({
	categories,
	day,
	formats,
	inMonth,
	isFocusTarget,
	isNarrow,
	isToday,
	locale,
	onClick,
	onKeyDown,
	total,
}: MonthCellProps) {
	const date = fromIsoDate(day);
	const chips = total ? [...total.byCategory] : [];
	const shown = chips.slice(0, MAX_CHIPS);
	const overflow = chips.length - shown.length;
	const spokenDate = isToday
		? `${formats.long.format(date)}, ${m.calendar_today_marker()}`
		: formats.long.format(date);
	const spokenTotal = total
		? formatMinutesLong(total.total, locale)
		: m.calendar_nothing_logged();

	return (
		<button
			// Opens the new-entry dialog for this day.
			aria-haspopup="dialog"
			className={cn(
				"flex min-h-0 touch-manipulation flex-col gap-1 overflow-hidden rounded-sm border-2 p-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:p-1.5",
				inMonth
					? "border-transparent bg-muted hover:border-border"
					: "border-transparent bg-transparent text-muted-foreground hover:border-border/60",
				isToday && "border-border border-dashed"
			)}
			data-date={day}
			onClick={onClick}
			onKeyDown={onKeyDown}
			tabIndex={isFocusTarget ? 0 : -1}
			type="button"
		>
			{/* The spoken name contains the visible day number (WCAG 2.5.3). */}
			<span className="sr-only">
				{spokenDate}: {spokenTotal}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					"w-fit font-mono text-[11px] tabular-nums leading-none sm:text-xs",
					isToday &&
						"rounded-sm border-2 border-border bg-primary px-1 py-0.5 font-bold text-primary-foreground"
				)}
			>
				{formats.dayNumber.format(date)}
			</span>
			{total && isNarrow ? (
				<DurationChip className="bg-accent text-accent-foreground">
					{formatMinutes(total.total)}
				</DurationChip>
			) : null}
			{total && !isNarrow ? (
				<span aria-hidden="true" className="flex flex-col items-start gap-0.5">
					{shown.map(([categoryId, minutes]) => {
						const category =
							categoryId === UNCATEGORIZED
								? undefined
								: categories.byId.get(categoryId);
						return (
							<DurationChip
								className={
									category ? CATEGORY_CHIP[category.color] : UNCATEGORIZED_CHIP
								}
								key={categoryId}
								title={category?.name ?? m.calendar_uncategorized()}
							>
								{formatMinutes(minutes)}
							</DurationChip>
						);
					})}
					{overflow > 0 ? (
						<span className="font-mono text-[10px] text-muted-foreground">
							{m.calendar_more({ count: overflow })}
						</span>
					) : null}
				</span>
			) : null}
		</button>
	);
}

const MonthCell = memo(MonthCellView);

function DurationChip({
	children,
	className,
	title,
}: {
	children: string;
	className: string;
	title?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"rounded-[3px] border border-border px-1 py-px font-bold font-mono text-[10px] tabular-nums leading-tight sm:px-1.5 sm:py-0.5 sm:text-xs",
				className
			)}
			title={title}
		>
			{children}
		</span>
	);
}

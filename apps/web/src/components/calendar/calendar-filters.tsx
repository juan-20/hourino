import { Button } from "@hourino/ui/components/button";
import { cn } from "@hourino/ui/lib/utils";
import { type MouseEvent, useCallback } from "react";

import { UNCATEGORIZED } from "@/lib/calendar";
import { formatMinutes, formatMinutesLong } from "@/lib/time-format";
import { m } from "@/paraglide/messages";

import { CATEGORY_SWATCH, type CategoryIndex } from "./calendar-data";

const FIELDSET_RESET = "m-0 min-w-0 border-0 p-0";
// The accent tint is too close to the outline surface in dark mode, so the
// states are carried by text treatment instead: shown categories read at full
// strength, hidden ones are struck through and dimmed ("All" fills when on).
const FILTER_CHIP =
	"text-foreground aria-[pressed=false]:text-muted-foreground aria-[pressed=false]:line-through aria-[pressed=false]:[&>span:first-child]:opacity-40";
const ALL_CHIP =
	"aria-pressed:bg-primary aria-pressed:text-primary-foreground dark:aria-pressed:bg-primary";

interface CategoryFiltersProps {
	categories: CategoryIndex;
	hidden: ReadonlySet<string>;
	onReset: () => void;
	onToggle: (id: string) => void;
}

/** Toggle chips, one per category, same pattern as the landing demo's filter. */
export function CategoryFilters({
	categories,
	hidden,
	onReset,
	onToggle,
}: CategoryFiltersProps) {
	const handleToggle = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			onToggle(event.currentTarget.dataset.category as string),
		[onToggle]
	);

	return (
		<fieldset className={cn(FIELDSET_RESET, "flex flex-wrap gap-1.5")}>
			<legend className="mb-2 font-medium text-muted-foreground text-xs">
				{m.calendar_filter()}
			</legend>
			<Button
				aria-pressed={hidden.size === 0}
				className={ALL_CHIP}
				onClick={onReset}
				size="sm"
				variant="outline"
			>
				{m.calendar_filter_all()}
			</Button>
			{categories.active.map((category) => (
				<Button
					aria-pressed={!hidden.has(category.id)}
					className={cn("max-w-full", FILTER_CHIP)}
					data-category={category.id}
					key={category.id}
					onClick={handleToggle}
					size="sm"
					variant="outline"
				>
					<span
						aria-hidden="true"
						className={cn(
							"size-2.5 shrink-0 rounded-[2px] border border-border",
							CATEGORY_SWATCH[category.color]
						)}
					/>
					<span className="truncate">{category.name}</span>
				</Button>
			))}
			<Button
				aria-pressed={!hidden.has(UNCATEGORIZED)}
				className={FILTER_CHIP}
				data-category={UNCATEGORIZED}
				onClick={handleToggle}
				size="sm"
				variant="outline"
			>
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-[2px] border border-border bg-card"
				/>
				{m.calendar_uncategorized()}
			</Button>
			{categories.active.length === 0 ? (
				<p className="mt-1 w-full text-muted-foreground text-xs">
					{m.calendar_no_categories()}
				</p>
			) : null}
		</fieldset>
	);
}

/** Big mono period total; announced politely when filters or the period change. */
export function PeriodTotal({
	label,
	locale,
	minutes,
}: {
	label: string;
	locale: string;
	minutes: number;
}) {
	return (
		<p aria-live="polite">
			<span className="block text-muted-foreground text-xs">{label}</span>
			<span
				aria-hidden="true"
				className="font-bold font-mono text-3xl tabular-nums leading-tight"
			>
				{formatMinutes(minutes)}
			</span>
			<span className="sr-only">{formatMinutesLong(minutes, locale)}</span>
		</p>
	);
}

/*
 * Pure logic behind the landing page's calendar demo: month grid, deterministic
 * sample data, and duration formatting. No React, no persistence; the demo
 * lives entirely in component state.
 */

export const CATEGORY_IDS = [
	"work",
	"study",
	"health",
	"home",
	"leisure",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];
export type DayEntries = Partial<Record<CategoryId, number>>;
/** Minutes per category, keyed by local ISO date (`YYYY-MM-DD`). */
export type MonthEntries = Record<string, DayEntries>;

export const QUICK_ADD_MINUTES = 30;
const MAX_MINUTES_PER_DAY = 24 * 60;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local-calendar `YYYY-MM-DD` key for a date (not UTC, so it never shifts a day across time zones). */
export function toIsoDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Weeks of the month containing `date`, Sunday first; `null` pads days outside the month. */
export function buildMonthMatrix(date: Date): (Date | null)[][] {
	const year = date.getFullYear();
	const month = date.getMonth();
	const leading = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const cells: (Date | null)[] = [
		...Array.from({ length: leading }, () => null),
		...Array.from(
			{ length: daysInMonth },
			(_, index) => new Date(year, month, index + 1)
		),
	];
	while (cells.length % 7 !== 0) {
		cells.push(null);
	}

	const weeks: (Date | null)[][] = [];
	for (let start = 0; start < cells.length; start += 7) {
		weeks.push(cells.slice(start, start + 7));
	}
	return weeks;
}

/** Tiny seeded sine-hash PRNG so the sample month is stable across reloads (demo-grade, not crypto). */
function createRandom(seed: number): () => number {
	let counter = 0;
	return () => {
		counter += 1;
		const value = Math.sin(seed * 12.9898 + counter * 78.233) * 43_758.5453;
		return value - Math.floor(value);
	};
}

/** [chance on weekdays, chance on weekends, min slots, max slots] in 30-minute slots. */
const SEED_PROFILE: Record<CategoryId, [number, number, number, number]> = {
	health: [0.45, 0.55, 1, 2],
	home: [0.3, 0.6, 1, 3],
	leisure: [0.35, 0.8, 1, 6],
	study: [0.4, 0.25, 1, 4],
	work: [0.85, 0.05, 4, 16],
};

/** Deterministic sample entries for every day of `today`'s month up to and including today. */
export function seedMonth(today: Date): MonthEntries {
	const entries: MonthEntries = {};
	const year = today.getFullYear();
	const month = today.getMonth();

	for (let day = 1; day <= today.getDate(); day += 1) {
		const date = new Date(year, month, day);
		const random = createRandom(year * 10_000 + (month + 1) * 100 + day);
		// Leave roughly one day in eight blank so the month doesn't look filled in by a robot.
		if (random() < 0.12) {
			continue;
		}
		const weekend = date.getDay() === 0 || date.getDay() === 6;
		const dayEntries: DayEntries = {};
		for (const category of CATEGORY_IDS) {
			const [weekdayChance, weekendChance, minSlots, maxSlots] =
				SEED_PROFILE[category];
			if (random() < (weekend ? weekendChance : weekdayChance)) {
				const slots =
					minSlots + Math.floor(random() * (maxSlots - minSlots + 1));
				dayEntries[category] = slots * QUICK_ADD_MINUTES;
			}
		}
		if (Object.keys(dayEntries).length > 0) {
			entries[toIsoDate(date)] = dayEntries;
		}
	}
	return entries;
}

/** Minutes logged on one day, counting only the categories in `filters`. */
export function dayTotal(
	day: DayEntries | undefined,
	filters: readonly CategoryId[]
): number {
	if (!day) {
		return 0;
	}
	return filters.reduce((sum, category) => sum + (day[category] ?? 0), 0);
}

/** Minutes logged across every day in `entries`, counting only the categories in `filters`. */
export function monthTotal(
	entries: MonthEntries,
	filters: readonly CategoryId[]
): number {
	return Object.values(entries).reduce(
		(sum, day) => sum + dayTotal(day, filters),
		0
	);
}

/** Adds minutes to one category of one day, capped so a day never exceeds 24 hours. */
export function addMinutes(
	entries: MonthEntries,
	isoDate: string,
	category: CategoryId,
	minutes: number
): MonthEntries {
	const day = entries[isoDate] ?? {};
	const room = MAX_MINUTES_PER_DAY - dayTotal(day, CATEGORY_IDS);
	const added = Math.min(minutes, room);
	if (added <= 0) {
		return entries;
	}
	return {
		...entries,
		[isoDate]: { ...day, [category]: (day[category] ?? 0) + added },
	};
}

/** Compact duration for tight cells: `45m`, `3h`, `2h30`. */
export function formatMinutes(total: number): string {
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	if (hours === 0) {
		return `${minutes}m`;
	}
	return minutes === 0 ? `${hours}h` : `${hours}h${pad(minutes)}`;
}

/** Spoken duration for screen readers, e.g. "2 hours 30 minutes" / "2 horas 30 minutos". */
export function formatMinutesLong(total: number, locale: string): string {
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	const unit = (value: number, name: "hour" | "minute") =>
		new Intl.NumberFormat(locale, {
			style: "unit",
			unit: name,
			unitDisplay: "long",
		}).format(value);

	if (hours === 0) {
		return unit(minutes, "minute");
	}
	return minutes === 0
		? unit(hours, "hour")
		: `${unit(hours, "hour")} ${unit(minutes, "minute")}`;
}

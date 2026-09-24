import { describe, expect, it } from "vitest";

import {
	addDays,
	type CalendarEntry,
	dayTotals,
	isEntryVisible,
	layoutDay,
	monthGridDays,
	orderedCategories,
	periodDays,
	shiftDate,
	snapToSlot,
	startOfWeek,
	UNCATEGORIZED,
	weekDays,
	windowFor,
} from "./calendar";
import {
	formatMinutes,
	minuteToTimeInput,
	parseTimeInput,
} from "./time-format";

function entry(
	partial: Partial<CalendarEntry> & Pick<CalendarEntry, "id">
): CalendarEntry {
	const startMinute = partial.startMinute ?? 540;
	const endMinute = partial.endMinute ?? 600;
	return {
		categoryIds: [],
		description: null,
		endMinute,
		minutesWorked: endMinute - startMinute,
		startMinute,
		workDate: "2026-09-23",
		...partial,
	};
}

describe("date math", () => {
	it("adds days across month, year and DST boundaries", () => {
		expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		// US DST ends 2026-11-01 and Brazil has none; either way, no skipped day.
		expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});

	it("starts weeks on Sunday", () => {
		expect(startOfWeek("2026-09-23")).toBe("2026-09-20");
		expect(startOfWeek("2026-09-20")).toBe("2026-09-20");
		expect(weekDays("2026-09-23")).toEqual([
			"2026-09-20",
			"2026-09-21",
			"2026-09-22",
			"2026-09-23",
			"2026-09-24",
			"2026-09-25",
			"2026-09-26",
		]);
	});

	it("builds a 42-day month grid starting on the Sunday before the 1st", () => {
		const days = monthGridDays("2026-09-23");
		expect(days).toHaveLength(42);
		expect(days[0]).toBe("2026-08-30");
		expect(days.at(-1)).toBe("2026-10-10");
	});

	it("shares one fetch window between day and week, and caps month at 42 days", () => {
		expect(windowFor("day", "2026-09-23")).toEqual(
			windowFor("week", "2026-09-26")
		);
		expect(windowFor("week", "2026-09-23")).toEqual({
			from: "2026-09-20",
			to: "2026-09-27",
		});
		expect(windowFor("month", "2026-09-23")).toEqual({
			from: "2026-08-30",
			to: "2026-10-11",
		});
	});

	it("counts only the month's own days in the month period", () => {
		const days = periodDays("month", "2026-02-10");
		expect(days).toHaveLength(28);
		expect(days[0]).toBe("2026-02-01");
		expect(periodDays("day", "2026-02-10")).toEqual(["2026-02-10"]);
	});

	it("steps periods without month overflow", () => {
		expect(shiftDate("day", "2026-09-30", 1)).toBe("2026-10-01");
		expect(shiftDate("week", "2026-09-23", -1)).toBe("2026-09-16");
		expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-01");
		expect(shiftDate("month", "2026-01-15", -1)).toBe("2025-12-01");
	});

	it("snaps clicks to 15-minute slots that leave room for an hour", () => {
		expect(snapToSlot(547)).toBe(540);
		expect(snapToSlot(-5)).toBe(0);
		expect(snapToSlot(1439)).toBe(1380);
	});
});

describe("time formatting", () => {
	it("round-trips the time input format", () => {
		expect(minuteToTimeInput(570)).toBe("09:30");
		expect(parseTimeInput("09:30")).toBe(570);
		expect(parseTimeInput("24:00")).toBe(1440);
		expect(parseTimeInput("24:15")).toBeNull();
		expect(parseTimeInput("9:30")).toBeNull();
		expect(parseTimeInput("")).toBeNull();
	});

	it("formats compact durations", () => {
		expect(formatMinutes(45)).toBe("45m");
		expect(formatMinutes(180)).toBe("3h");
		expect(formatMinutes(150)).toBe("2h30");
	});
});

describe("category filtering", () => {
	const order = new Map([
		["a", 0],
		["b", 1],
		["c", 2],
	]);

	it("keeps a categorized entry while any of its categories is shown", () => {
		const tagged = { categoryIds: ["a", "b"] };
		expect(isEntryVisible(tagged, new Set(["a"]))).toBe(true);
		expect(isEntryVisible(tagged, new Set(["a", "b"]))).toBe(false);
	});

	it("routes uncategorized entries through the UNCATEGORIZED switch", () => {
		expect(isEntryVisible({ categoryIds: [] }, new Set())).toBe(true);
		expect(isEntryVisible({ categoryIds: [] }, new Set([UNCATEGORIZED]))).toBe(
			false
		);
	});

	it("treats entries whose only categories have no filter chip as uncategorized", () => {
		// "gone" was deleted: it has no chip, so it can't be toggled off.
		const filterable = new Set(["a", "b"]);
		const orphan = { categoryIds: ["gone"] };
		expect(isEntryVisible(orphan, new Set(), filterable)).toBe(true);
		expect(isEntryVisible(orphan, new Set([UNCATEGORIZED]), filterable)).toBe(
			false
		);
		// Mixed: the chip-less category neither keeps it visible nor hides it.
		const mixed = { categoryIds: ["a", "gone"] };
		expect(isEntryVisible(mixed, new Set(["a"]), filterable)).toBe(false);
		expect(isEntryVisible(mixed, new Set(), filterable)).toBe(true);
	});

	it("orders categories by the list order and skips hidden or unknown ones", () => {
		expect(orderedCategories({ categoryIds: ["c", "zz", "a"] }, order)).toEqual(
			["a", "c"]
		);
		expect(
			orderedCategories({ categoryIds: ["c", "a"] }, order, new Set(["a"]))
		).toEqual(["c"]);
	});

	it("totals each day once, attributing minutes to the primary category", () => {
		const totals = dayTotals(
			[
				entry({ categoryIds: ["b", "a"], endMinute: 600, id: "1" }),
				entry({ categoryIds: [], endMinute: 570, id: "2" }),
				entry({ categoryIds: ["c"], id: "3", workDate: "2026-09-24" }),
			],
			order,
			new Set(["a"])
		);
		const day = totals.get("2026-09-23");
		expect(day?.total).toBe(90);
		expect([...(day?.byCategory ?? [])]).toEqual([
			["b", 60],
			[UNCATEGORIZED, 30],
		]);
		expect(totals.get("2026-09-24")?.total).toBe(60);
	});
});

describe("layoutDay", () => {
	it("gives non-overlapping entries the full width", () => {
		const result = layoutDay([
			entry({ endMinute: 600, id: "a", startMinute: 540 }),
			entry({ endMinute: 660, id: "b", startMinute: 600 }),
		]);
		expect(result.map((p) => [p.entry.id, p.column, p.columns])).toEqual([
			["a", 0, 1],
			["b", 0, 1],
		]);
	});

	it("puts overlapping entries side by side and reuses freed columns", () => {
		const result = layoutDay([
			entry({ endMinute: 720, id: "long", startMinute: 540 }),
			entry({ endMinute: 600, id: "early", startMinute: 540 }),
			entry({ endMinute: 660, id: "later", startMinute: 600 }),
		]);
		expect(result.map((p) => [p.entry.id, p.column, p.columns])).toEqual([
			["long", 0, 2],
			["early", 1, 2],
			["later", 1, 2],
		]);
	});

	it("keeps chained overlaps in one cluster", () => {
		const result = layoutDay([
			entry({ endMinute: 600, id: "a", startMinute: 540 }),
			entry({ endMinute: 660, id: "b", startMinute: 570 }),
			entry({ endMinute: 720, id: "c", startMinute: 630 }),
			entry({ endMinute: 800, id: "d", startMinute: 720 }),
		]);
		expect(result.map((p) => [p.entry.id, p.column, p.columns])).toEqual([
			["a", 0, 2],
			["b", 1, 2],
			["c", 0, 2],
			["d", 0, 1],
		]);
	});
});

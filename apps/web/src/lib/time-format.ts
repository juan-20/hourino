/*
 * Date/duration formatting shared by the landing demo and the real calendar.
 * Everything is local wall-clock: no UTC conversion, so a day never shifts
 * across time zones.
 */

const pad = (value: number) => String(value).padStart(2, "0");

const TIME_INPUT = /^(\d{2}):(\d{2})$/;

/** Local-calendar `YYYY-MM-DD` key for a date (not UTC, so it never shifts a day across time zones). */
export function toIsoDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local-midnight `Date` for a `YYYY-MM-DD` key. */
export function fromIsoDate(isoDate: string): Date {
	const [year, month, day] = isoDate.split("-").map(Number);
	return new Date(year, month - 1, day);
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

/** `570` → `"09:30"`: the `<input type="time">` wire format (always 24h). */
export function minuteToTimeInput(minute: number): string {
	return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** `"09:30"` → `570`; `null` when the string isn't a valid `HH:MM`. `"24:00"` is allowed as end-of-day. */
export function parseTimeInput(value: string): number | null {
	const match = TIME_INPUT.exec(value);
	if (!match) {
		return null;
	}
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) {
		return null;
	}
	return hours * 60 + minutes;
}

// Constructing Intl formatters is expensive and labels render per hour line
// and per entry, so keep one per locale.
const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** Locale-formatted clock label for minutes from midnight (`570` → `9:30 AM` / `09:30`). */
export function minuteToLabel(minute: number, locale: string): string {
	let format = clockFormats.get(locale);
	if (!format) {
		format = new Intl.DateTimeFormat(locale, {
			hour: "numeric",
			minute: "2-digit",
		});
		clockFormats.set(locale, format);
	}
	// 1440 (end of day) rolls over to the next day's 00:00, which is the
	// correct wall-clock reading anyway.
	return format.format(new Date(2000, 0, 1, 0, minute));
}

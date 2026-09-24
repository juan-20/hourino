import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import {
	categoriesQueryOptions,
	useCategoryIndex,
} from "@/components/calendar/calendar-data";
import { pickCalendarSearch } from "@/components/calendar/calendar-search";
import { EntryDialog } from "@/components/calendar/entry-dialog";
import { DEFAULT_ENTRY_MINUTES, MINUTES_PER_DAY } from "@/lib/calendar";
import { toIsoDate } from "@/lib/time-format";

const DEFAULT_START_MINUTE = 540;

/** Prefill from a clicked slot or the "New entry" button; all optional. */
const newEntrySearchSchema = z.object({
	end: z.number().int().min(1).max(MINUTES_PER_DAY).optional().catch(undefined),
	start: z
		.number()
		.int()
		.min(0)
		.max(MINUTES_PER_DAY - 1)
		.optional()
		.catch(undefined),
	workDate: z.iso.date().optional().catch(undefined),
});

export const Route = createFileRoute("/_auth/calendar/entries/new")({
	validateSearch: (search) => newEntrySearchSchema.parse(search),
	// Instant when opened from the grid (already cached); on a cold deep link
	// it keeps the dialog from rendering before its category chips.
	loader: ({ context: { queryClient } }) =>
		queryClient.ensureQueryData(categoriesQueryOptions()),
	component: NewEntryRoute,
});

function NewEntryRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { index } = useCategoryIndex();
	const [today] = useState(() => toIsoDate(new Date()));

	const startMinute = search.start ?? DEFAULT_START_MINUTE;
	const endMinute =
		search.end !== undefined && search.end > startMinute
			? search.end
			: Math.min(startMinute + DEFAULT_ENTRY_MINUTES, MINUTES_PER_DAY);

	// replace: closing shouldn't leave the dialog URL in history, so Back
	// after saving doesn't reopen an empty form.
	const close = () =>
		navigate({
			replace: true,
			search: pickCalendarSearch(search),
			to: "/calendar",
		});

	return (
		<EntryDialog
			categories={index}
			initial={{
				categoryIds: [],
				description: null,
				endMinute,
				startMinute,
				workDate: search.workDate ?? search.date ?? today,
			}}
			onClose={close}
		/>
	);
}

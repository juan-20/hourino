import type { AppRouter } from "@hourino/api/routers/index";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useEffect, useMemo } from "react";

import {
	type CalendarEntry,
	type CalendarView,
	shiftDate,
	windowFor,
} from "@/lib/calendar";
import { trpc } from "@/utils/trpc";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Category = RouterOutputs["categories"]["list"]["items"][number];
export type CategoryColor = Category["color"];

/** Same order as the DB enum; also the order of the color picker. */
export const CATEGORY_COLORS: readonly CategoryColor[] = [
	"powder",
	"espresso",
	"ochre",
	"terracotta",
	"moss",
	"teal",
	"plum",
	"rose",
];

// Literal class names so Tailwind's scanner sees them (tokens: globals.css).
export const CATEGORY_CHIP: Record<CategoryColor, string> = {
	espresso: "bg-category-espresso text-category-espresso-foreground",
	moss: "bg-category-moss text-category-moss-foreground",
	ochre: "bg-category-ochre text-category-ochre-foreground",
	plum: "bg-category-plum text-category-plum-foreground",
	powder: "bg-category-powder text-category-powder-foreground",
	rose: "bg-category-rose text-category-rose-foreground",
	teal: "bg-category-teal text-category-teal-foreground",
	terracotta: "bg-category-terracotta text-category-terracotta-foreground",
};

export const CATEGORY_SWATCH: Record<CategoryColor, string> = {
	espresso: "bg-category-espresso",
	moss: "bg-category-moss",
	ochre: "bg-category-ochre",
	plum: "bg-category-plum",
	powder: "bg-category-powder",
	rose: "bg-category-rose",
	teal: "bg-category-teal",
	terracotta: "bg-category-terracotta",
};

/** Uncategorized entries render on the neutral card surface. */
export const UNCATEGORIZED_CHIP = "bg-card text-card-foreground";

const ENTRIES_STALE_MS = 30_000;
/** One page covers any realistic number of personal categories. */
const CATEGORY_PAGE_SIZE = 100;

export function categoriesQueryOptions() {
	return trpc.categories.list.queryOptions(
		{ limit: CATEGORY_PAGE_SIZE, status: "all" },
		{ staleTime: Number.POSITIVE_INFINITY }
	);
}

export function entriesQueryOptions(view: CalendarView, date: string) {
	return trpc.timeEntries.list.queryOptions(windowFor(view, date), {
		staleTime: ENTRIES_STALE_MS,
	});
}

export interface CategoryIndex {
	/** Active (not soft-deleted) categories, in list order: pickers and filters. */
	active: Category[];
	byId: ReadonlyMap<string, Category>;
	/** Ids that have a filter chip (the active ones); see `isEntryVisible`. */
	filterable: ReadonlySet<string>;
	/** id → position in the list; defines each entry's primary category. */
	order: ReadonlyMap<string, number>;
}

const EMPTY_CATEGORIES: Category[] = [];

export function useCategoryIndex() {
	const query = useQuery(categoriesQueryOptions());
	const items = query.data?.items ?? EMPTY_CATEGORIES;
	const index = useMemo<CategoryIndex>(() => {
		const active = items.filter((category) => category.deletedAt === null);
		return {
			active,
			byId: new Map(items.map((category) => [category.id, category])),
			filterable: new Set(active.map((category) => category.id)),
			order: new Map(items.map((category, i) => [category.id, i])),
		};
	}, [items]);
	return { index, query };
}

const EMPTY_ENTRIES: CalendarEntry[] = [];

/**
 * The visible window's entries, unfiltered. Keeps the previous window on
 * screen while the next one loads, and prefetches both neighbours once the
 * current window has settled so prev/next feel instant.
 */
export function useWindowEntries(view: CalendarView, date: string) {
	const queryClient = useQueryClient();
	const query = useQuery({
		...entriesQueryOptions(view, date),
		placeholderData: keepPreviousData,
	});

	const settled = query.isSuccess && !query.isPlaceholderData;
	useEffect(() => {
		if (!settled) {
			return;
		}
		for (const direction of [-1, 1] as const) {
			queryClient.prefetchQuery(
				entriesQueryOptions(view, shiftDate(view, date, direction))
			);
		}
	}, [settled, queryClient, view, date]);

	return { entries: query.data ?? EMPTY_ENTRIES, query };
}

/** Finds an entry in any cached window, so an edit dialog can open without a request. */
export function findCachedEntry(
	queryClient: ReturnType<typeof useQueryClient>,
	entryId: string
): CalendarEntry | undefined {
	const windows = queryClient.getQueriesData<CalendarEntry[]>({
		queryKey: trpc.timeEntries.list.pathKey(),
	});
	for (const [, entries] of windows) {
		const hit = entries?.find((entry) => entry.id === entryId);
		if (hit) {
			return hit;
		}
	}
	return undefined;
}

type WindowSnapshot = [readonly unknown[], CalendarEntry[] | undefined][];

export function useEntryMutations() {
	const queryClient = useQueryClient();

	const refreshWindows = () =>
		queryClient.invalidateQueries(trpc.timeEntries.list.pathFilter());

	const seedById = (entry: CalendarEntry) =>
		queryClient.setQueryData(
			trpc.timeEntries.getById.queryKey({ id: entry.id }),
			entry
		);

	const create = useMutation(
		trpc.timeEntries.create.mutationOptions({
			onSuccess: (entry) => {
				seedById(entry);
				return refreshWindows();
			},
		})
	);

	const update = useMutation(
		trpc.timeEntries.update.mutationOptions({
			onSuccess: (entry) => {
				seedById(entry);
				return refreshWindows();
			},
		})
	);

	// Optimistic: the block disappears immediately; rolled back on failure.
	// Callbacks live on useMutation itself so the snapshot context is typed.
	const remove = useMutation({
		...trpc.timeEntries.delete.mutationOptions(),
		onError: (_error, _input, context) => {
			// tRPC's mutationOptions() fixes the context type; onMutate below
			// always returns this snapshot.
			const snapshot = context as WindowSnapshot | undefined;
			for (const [key, data] of snapshot ?? []) {
				queryClient.setQueryData(key, data);
			}
		},
		onMutate: async ({ id }): Promise<WindowSnapshot> => {
			const filter = trpc.timeEntries.list.pathFilter();
			await queryClient.cancelQueries(filter);
			const snapshot = queryClient.getQueriesData<CalendarEntry[]>(filter);
			queryClient.setQueriesData<CalendarEntry[]>(filter, (entries) =>
				entries?.filter((entry) => entry.id !== id)
			);
			return snapshot;
		},
		onSettled: refreshWindows,
		// Back-navigating to the deleted entry's URL must not reopen stale data.
		onSuccess: (_result, { id }) =>
			queryClient.removeQueries({
				queryKey: trpc.timeEntries.getById.queryKey({ id }),
			}),
	});

	const createCategory = useMutation(
		trpc.categories.create.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries(trpc.categories.list.pathFilter()),
		})
	);

	return { create, createCategory, remove, update };
}

import { Button } from "@hourino/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@hourino/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
	categoriesQueryOptions,
	findCachedEntry,
	useCategoryIndex,
} from "@/components/calendar/calendar-data";
import { pickCalendarSearch } from "@/components/calendar/calendar-search";
import { EntryDialog } from "@/components/calendar/entry-dialog";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_auth/calendar/entries/$entryId")({
	component: EditEntryRoute,
	// Runs on hover too (defaultPreload: "intent"), so the dialog usually opens
	// with data already cached. A block clicked in the grid is seeded straight
	// from its window instead of refetched.
	loader: async ({ context: { queryClient, trpc }, params }) => {
		const byId = trpc.timeEntries.getById.queryOptions({ id: params.entryId });
		if (queryClient.getQueryData(byId.queryKey) === undefined) {
			const cached = findCachedEntry(queryClient, params.entryId);
			if (cached) {
				queryClient.setQueryData(byId.queryKey, cached);
			}
		}
		await Promise.all([
			// A missing entry is rendered by the component, not thrown here.
			queryClient.ensureQueryData({ ...byId, retry: false }).catch(() => null),
			queryClient.ensureQueryData(categoriesQueryOptions()),
		]);
	},
});

function EditEntryRoute() {
	const { entryId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { trpc } = Route.useRouteContext();
	const { index } = useCategoryIndex();
	const entry = useQuery({
		...trpc.timeEntries.getById.queryOptions({ id: entryId }),
		retry: false,
		// Seeded from the visible window moments ago; don't refetch on open.
		staleTime: 30_000,
	});

	const close = () =>
		navigate({
			replace: true,
			search: pickCalendarSearch(search),
			to: "/calendar",
		});

	if (entry.isPending) {
		return null;
	}
	if (!entry.data) {
		return <NotFoundDialog onClose={close} />;
	}

	return (
		<EntryDialog
			categories={index}
			entryId={entryId}
			initial={entry.data}
			// Remount per entry so the form never shows the previous entry's values.
			key={entryId}
			onClose={close}
		/>
	);
}

function NotFoundDialog({ onClose }: { onClose: () => void }) {
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-bold text-base">
						{m.entry_title_edit()}
					</DialogTitle>
					<DialogDescription>{m.entry_not_found()}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={onClose} variant="outline">
						{m.entry_cancel()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

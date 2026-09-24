import { createFileRoute } from "@tanstack/react-router";

// The calendar itself lives in the layout (route.tsx); this child only exists
// so /calendar matches with no dialog open.
export const Route = createFileRoute("/_auth/calendar/")({
	component: () => null,
});

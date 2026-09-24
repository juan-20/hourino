import { type RefObject, useEffect, useRef } from "react";

import {
	DEFAULT_ENTRY_MINUTES,
	MINUTES_PER_DAY,
	SLOT_MINUTES,
} from "@/lib/calendar";

/** Pointer travel (px) that turns a press into a sweep instead of a click. */
const DRAG_THRESHOLD = 4;
/** Touch: hold this long before dragging sweeps; a quicker move scrolls. */
const HOLD_MS = 350;
/** Touch: movement that cancels the hold (it's a scroll). */
const TOUCH_SLOP = 8;
/** Distance from the scroller's top/bottom edge that starts auto-scrolling. */
const EDGE_PX = 44;

export type SweepVia = "click" | "sweep";

export interface SweepRange {
	end: number;
	start: number;
}

interface Sweep {
	anchor: number;
	column: HTMLElement;
	day: string;
	lastY: number;
	mode: "pending" | "sweep";
	pointerId?: number;
	range?: SweepRange;
	startX: number;
	startY: number;
	timer?: number;
	touch: boolean;
}

interface UseSweepOptions {
	/** Called on release (sweep) or plain click/tap (1h slot). */
	onCommit: (day: string, range: SweepRange, via: SweepVia) => void;
	/**
	 * Paints the live ghost inside `container`; `null` clears it. Runs on every
	 * snapped change.
	 */
	onPaint: (
		container: HTMLElement,
		day: string,
		range: SweepRange | null
	) => void;
	/** The scroll container that holds the day columns (`[data-sweep-day]`). */
	scrollRef: RefObject<HTMLElement | null>;
}

const snapDown = (minute: number) =>
	Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES;

/** Anchor-to-pointer range, snapped, in either direction (drag up works too). */
function rangeBetween(anchor: number, current: number): SweepRange {
	const a = snapDown(anchor);
	const c = snapDown(current);
	return {
		end: Math.min(Math.max(a, c) + SLOT_MINUTES, MINUTES_PER_DAY),
		start: Math.min(a, c),
	};
}

function minuteAt(column: HTMLElement, clientY: number): number {
	const { height, top } = column.getBoundingClientRect();
	const minute = ((clientY - top) / height) * MINUTES_PER_DAY;
	return Math.min(Math.max(minute, 0), MINUTES_PER_DAY - 1);
}

/** A plain click/tap keeps the old behavior: a one-hour slot at the press. */
function clickRange(anchor: number): SweepRange {
	const start = Math.min(
		snapDown(anchor),
		MINUTES_PER_DAY - DEFAULT_ENTRY_MINUTES
	);
	return { end: start + DEFAULT_ENTRY_MINUTES, start };
}

/**
 * Drag-to-sweep on the time grid. Listeners are native and delegated to the
 * scroll container, and the ghost is painted through `onPaint` (imperative
 * DOM writes), so a sweep never re-renders the grid. Mouse/pen sweep after a
 * few pixels of travel; touch sweeps after a short hold so a quick swipe
 * still scrolls. Esc cancels mid-sweep. The keyboard path stays the day
 * header's "Add entry" link.
 */
export function useSweep({ onCommit, onPaint, scrollRef }: UseSweepOptions) {
	// Latest callbacks without re-binding listeners on every render.
	const callbacks = useRef({ onCommit, onPaint });
	callbacks.current = { onCommit, onPaint };

	useEffect(() => {
		const container = scrollRef.current;
		if (!container) {
			return;
		}
		let sweep: Sweep | null = null;
		let frame = 0;

		// Only presses on the empty column itself count; entry blocks are links.
		const columnFor = (target: EventTarget | null) =>
			target instanceof HTMLElement && target.dataset.sweepDay ? target : null;

		const paint = (active: Sweep, clientY: number) => {
			const range = rangeBetween(
				active.anchor,
				minuteAt(active.column, clientY)
			);
			if (
				active.range?.start === range.start &&
				active.range?.end === range.end
			) {
				return;
			}
			active.range = range;
			callbacks.current.onPaint(container, active.day, range);
		};

		const stopVisuals = () => {
			document.body.style.removeProperty("cursor");
			cancelAnimationFrame(frame);
			frame = 0;
		};

		// Keep sweeping while the pointer rests near an edge: scroll, repaint.
		const autoScroll = () => {
			if (sweep?.mode !== "sweep") {
				frame = 0;
				return;
			}
			const rect = container.getBoundingClientRect();
			const header = container.querySelector<HTMLElement>(
				"[data-sweep-header]"
			);
			const top = rect.top + (header?.offsetHeight ?? 0);
			let delta = 0;
			if (sweep.lastY < top + EDGE_PX) {
				delta = -Math.ceil((top + EDGE_PX - sweep.lastY) / 3);
			} else if (sweep.lastY > rect.bottom - EDGE_PX) {
				delta = Math.ceil((sweep.lastY - (rect.bottom - EDGE_PX)) / 3);
			}
			if (delta !== 0) {
				container.scrollTop += delta;
				paint(sweep, sweep.lastY);
			}
			frame = requestAnimationFrame(autoScroll);
		};

		const begin = (active: Sweep) => {
			active.mode = "sweep";
			document.body.style.cursor = "ns-resize";
			paint(active, active.lastY);
			frame ||= requestAnimationFrame(autoScroll);
		};

		const finish = () => {
			const active = sweep;
			sweep = null;
			stopVisuals();
			if (!active) {
				return;
			}
			window.clearTimeout(active.timer);
			callbacks.current.onPaint(container, active.day, null);
			if (active.mode === "sweep" && active.range) {
				callbacks.current.onCommit(active.day, active.range, "sweep");
			} else {
				callbacks.current.onCommit(
					active.day,
					clickRange(active.anchor),
					"click"
				);
			}
		};

		const cancel = () => {
			const active = sweep;
			sweep = null;
			stopVisuals();
			if (active) {
				window.clearTimeout(active.timer);
				callbacks.current.onPaint(container, active.day, null);
			}
		};

		const start = (
			column: HTMLElement,
			x: number,
			y: number,
			touch: boolean
		): Sweep => {
			sweep = {
				anchor: minuteAt(column, y),
				column,
				day: column.dataset.sweepDay as string,
				lastY: y,
				mode: "pending",
				startX: x,
				startY: y,
				touch,
			};
			return sweep;
		};

		// ---- Mouse / pen -----------------------------------------------------
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === "touch" || event.button !== 0) {
				return;
			}
			const column = columnFor(event.target);
			if (!column) {
				return;
			}
			event.preventDefault(); // no text selection while dragging
			const active = start(column, event.clientX, event.clientY, false);
			active.pointerId = event.pointerId;
			try {
				column.setPointerCapture(event.pointerId);
			} catch {
				// Capture is a nicety; the sweep works without it.
			}
		};
		const onPointerMove = (event: PointerEvent) => {
			if (!sweep || sweep.touch || event.pointerId !== sweep.pointerId) {
				return;
			}
			sweep.lastY = event.clientY;
			if (sweep.mode === "sweep") {
				paint(sweep, event.clientY);
			} else if (Math.abs(event.clientY - sweep.startY) > DRAG_THRESHOLD) {
				begin(sweep);
			}
		};
		const onPointerUp = (event: PointerEvent) => {
			if (sweep && !sweep.touch && event.pointerId === sweep.pointerId) {
				finish();
			}
		};
		const onPointerCancel = (event: PointerEvent) => {
			if (sweep && !sweep.touch && event.pointerId === sweep.pointerId) {
				cancel();
			}
		};

		// ---- Touch: hold, then drag -----------------------------------------
		const onTouchStart = (event: TouchEvent) => {
			const column = columnFor(event.target);
			if (!column || event.touches.length !== 1) {
				return;
			}
			const [touch] = event.touches;
			const active = start(column, touch.clientX, touch.clientY, true);
			active.timer = window.setTimeout(() => {
				if (sweep === active && active.mode === "pending") {
					begin(active);
				}
			}, HOLD_MS);
		};
		const onTouchMove = (event: TouchEvent) => {
			if (!sweep?.touch) {
				return;
			}
			const [touch] = event.touches;
			if (sweep.mode === "pending") {
				const moved = Math.hypot(
					touch.clientX - sweep.startX,
					touch.clientY - sweep.startY
				);
				if (moved > TOUCH_SLOP) {
					// Moved before the hold finished: it's a scroll, let it be.
					window.clearTimeout(sweep.timer);
					sweep = null;
				}
				return;
			}
			event.preventDefault(); // the grid must not scroll under a sweep
			sweep.lastY = touch.clientY;
			paint(sweep, touch.clientY);
		};
		const onTouchEnd = () => {
			if (sweep?.touch) {
				finish();
			}
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && sweep?.mode === "sweep") {
				event.preventDefault();
				cancel();
			}
		};

		container.addEventListener("pointerdown", onPointerDown);
		container.addEventListener("pointermove", onPointerMove);
		container.addEventListener("pointerup", onPointerUp);
		container.addEventListener("pointercancel", onPointerCancel);
		container.addEventListener("touchstart", onTouchStart, { passive: true });
		container.addEventListener("touchmove", onTouchMove, { passive: false });
		container.addEventListener("touchend", onTouchEnd);
		container.addEventListener("touchcancel", cancel);
		document.addEventListener("keydown", onKeyDown);

		return () => {
			cancel();
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("pointermove", onPointerMove);
			container.removeEventListener("pointerup", onPointerUp);
			container.removeEventListener("pointercancel", onPointerCancel);
			container.removeEventListener("touchstart", onTouchStart);
			container.removeEventListener("touchmove", onTouchMove);
			container.removeEventListener("touchend", onTouchEnd);
			container.removeEventListener("touchcancel", cancel);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [scrollRef]);
}

import { Button } from "@hourino/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@hourino/ui/components/dialog";
import { Input } from "@hourino/ui/components/input";
import { Label } from "@hourino/ui/components/label";
import { Textarea } from "@hourino/ui/components/textarea";
import { cn } from "@hourino/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { PlusIcon } from "lucide-react";
import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useId,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { MINUTES_PER_DAY } from "@/lib/calendar";
import {
	formatMinutes,
	minuteToTimeInput,
	parseTimeInput,
} from "@/lib/time-format";
import { m } from "@/paraglide/messages";

import {
	CATEGORY_COLORS,
	CATEGORY_SWATCH,
	type Category,
	type CategoryColor,
	type CategoryIndex,
	useEntryMutations,
} from "./calendar-data";

const MAX_CATEGORIES = 10;
const MAX_DESCRIPTION = 2000;
const MAX_CATEGORY_NAME = 40;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLOR_LABEL: Record<CategoryColor, () => string> = {
	espresso: m.color_espresso,
	moss: m.color_moss,
	ochre: m.color_ochre,
	plum: m.color_plum,
	powder: m.color_powder,
	rose: m.color_rose,
	teal: m.color_teal,
	terracotta: m.color_terracotta,
};

export interface EntryDraft {
	categoryIds: string[];
	description: string | null;
	endMinute: number;
	startMinute: number;
	workDate: string;
}

/**
 * `<input type="time">` can't show "24:00", so an entry ending at midnight
 * displays "00:00" as its end, and "00:00" as an end reads back as 1440.
 */
const endToInput = (minute: number) =>
	minuteToTimeInput(minute >= MINUTES_PER_DAY ? 0 : minute);

function parseEnd(value: string): number | null {
	const minute = parseTimeInput(value);
	return minute === 0 ? MINUTES_PER_DAY : minute;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((id) => b.includes(id));

interface EntryDialogProps {
	categories: CategoryIndex;
	/** Present in edit mode. */
	entryId?: string;
	initial: EntryDraft;
	onClose: () => void;
}

/** Create/edit dialog for one entry. Rendered by the nested /calendar/entries/* routes. */
export function EntryDialog({
	categories,
	entryId,
	initial,
	onClose,
}: EntryDialogProps) {
	const { create, remove, update } = useEntryMutations();
	const [serverError, setServerError] = useState<string | null>(null);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const isEdit = entryId !== undefined;
	const ids = useId();
	const formRef = useRef<HTMLFormElement>(null);

	const form = useForm({
		defaultValues: {
			categoryIds: initial.categoryIds,
			description: initial.description ?? "",
			end: endToInput(initial.endMinute),
			start: minuteToTimeInput(initial.startMinute),
			workDate: initial.workDate,
		},
		onSubmit: async ({ value }) => {
			setServerError(null);
			const startMinute = parseTimeInput(value.start) ?? 0;
			const endMinute = parseEnd(value.end) ?? MINUTES_PER_DAY;
			const description = value.description.trim();
			try {
				if (isEdit) {
					await update.mutateAsync({
						// Only send categories when they changed: an old entry may
						// still carry a since-deleted category, which the API won't
						// accept as a new assignment.
						categoryIds: sameSet(value.categoryIds, initial.categoryIds)
							? undefined
							: value.categoryIds,
						description: description || null,
						endMinute,
						id: entryId,
						startMinute,
						workDate: value.workDate,
					});
					toast.success(m.entry_updated());
				} else {
					await create.mutateAsync({
						categoryIds: value.categoryIds,
						description: description || undefined,
						endMinute,
						startMinute,
						workDate: value.workDate,
					});
					toast.success(m.entry_created());
				}
				onClose();
			} catch (error) {
				setServerError(errorMessage(error));
			}
		},
		// Move focus to the first field that failed validation.
		onSubmitInvalid: () => {
			formRef.current
				?.querySelector<HTMLElement>('[aria-invalid="true"]')
				?.focus();
		},
	});

	const handleDelete = async () => {
		if (!entryId) {
			return;
		}
		if (!confirmingDelete) {
			setConfirmingDelete(true);
			return;
		}
		setServerError(null);
		try {
			await remove.mutateAsync({ id: entryId });
			toast.success(m.entry_deleted());
			onClose();
		} catch (error) {
			setConfirmingDelete(false);
			setServerError(errorMessage(error));
		}
	};

	const handleShortcut = useCallback(
		(event: KeyboardEvent<HTMLFormElement>) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				form.handleSubmit();
			}
		},
		[form]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			event.stopPropagation();
			form.handleSubmit();
		},
		[form]
	);
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				onClose();
			}
		},
		[onClose]
	);

	return (
		<Dialog onOpenChange={handleOpenChange} open>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="font-bold text-base">
						{isEdit ? m.entry_title_edit() : m.entry_title_new()}
					</DialogTitle>
					<DialogDescription>{m.entry_subtitle()}</DialogDescription>
				</DialogHeader>

				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: form-level Ctrl/Cmd+Enter save shortcut; every control inside stays independently operable. */}
				<form
					className="grid gap-3"
					noValidate
					onKeyDown={handleShortcut}
					onSubmit={handleSubmit}
					ref={formRef}
				>
					<form.Field
						name="workDate"
						validators={{
							onSubmit: ({ value }) =>
								ISO_DATE.test(value) ? undefined : m.entry_error_date(),
						}}
					>
						{(field) => (
							<FieldBlock
								errorId={`${ids}-date-error`}
								errors={field.state.meta.errors}
							>
								<Label htmlFor={`${ids}-date`}>{m.entry_date()}</Label>
								<Input
									aria-describedby={`${ids}-date-error`}
									aria-invalid={field.state.meta.errors.length > 0}
									autoComplete="off"
									id={`${ids}-date`}
									name="workDate"
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									required
									type="date"
									value={field.state.value}
								/>
							</FieldBlock>
						)}
					</form.Field>

					<div className="grid grid-cols-2 items-start gap-3">
						<form.Field
							name="start"
							validators={{
								onSubmit: ({ value }) =>
									parseTimeInput(value) === null || value === "24:00"
										? m.entry_error_time()
										: undefined,
							}}
						>
							{(field) => (
								<FieldBlock>
									<Label htmlFor={`${ids}-start`}>{m.entry_start()}</Label>
									<Input
										aria-describedby={`${ids}-time-status`}
										aria-invalid={field.state.meta.errors.length > 0}
										autoComplete="off"
										id={`${ids}-start`}
										name="start"
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										required
										step={900}
										type="time"
										value={field.state.value}
									/>
								</FieldBlock>
							)}
						</form.Field>
						<form.Field
							name="end"
							validators={{
								onSubmit: ({ fieldApi, value }) => {
									const end = parseEnd(value);
									if (end === null) {
										return m.entry_error_time();
									}
									const start = parseTimeInput(
										fieldApi.form.getFieldValue("start")
									);
									return start !== null && end <= start
										? m.entry_error_order()
										: undefined;
								},
							}}
						>
							{(field) => (
								<FieldBlock>
									<Label htmlFor={`${ids}-end`}>{m.entry_end()}</Label>
									<Input
										aria-describedby={`${ids}-time-status`}
										aria-invalid={field.state.meta.errors.length > 0}
										autoComplete="off"
										id={`${ids}-end`}
										name="end"
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
										required
										step={900}
										type="time"
										value={field.state.value}
									/>
								</FieldBlock>
							)}
						</form.Field>
					</div>

					{/* One always-present line under the time pair: the time errors when
					    there are any, otherwise the live duration. Its height never
					    changes, so an error can't push the fields around, and it spans
					    both columns so longer (pt-BR) messages stay on one line. */}
					<form.Subscribe
						selector={(state) => ({
							end: state.values.end,
							errors: [
								...(state.fieldMeta.start?.errors ?? []),
								...(state.fieldMeta.end?.errors ?? []),
							],
							start: state.values.start,
						})}
					>
						{({ end, errors, start }) => {
							const message = errors.filter(Boolean).map(String).join(" ");
							const from = parseTimeInput(start);
							const to = parseEnd(end);
							const duration =
								from !== null && to !== null && to > from
									? m.entry_duration({ duration: formatMinutes(to - from) })
									: "";
							return (
								<p
									className={cn(
										"-mt-1.5 min-h-4 text-xs leading-4",
										message
											? "text-destructive"
											: "font-mono text-muted-foreground tabular-nums"
									)}
									id={`${ids}-time-status`}
								>
									{message || duration}
								</p>
							);
						}}
					</form.Subscribe>

					<form.Field name="description">
						{(field) => (
							<div className="grid gap-2">
								<Label htmlFor={`${ids}-description`}>
									{m.entry_description()}{" "}
									<span className="font-normal text-muted-foreground">
										({m.entry_optional()})
									</span>
								</Label>
								<Textarea
									autoComplete="off"
									id={`${ids}-description`}
									maxLength={MAX_DESCRIPTION}
									name="description"
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									rows={2}
									value={field.state.value}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="categoryIds">
						{(field) => (
							<CategoryPicker
								categories={categories}
								onChange={field.handleChange}
								selected={field.state.value}
							/>
						)}
					</form.Field>

					{serverError ? (
						<p className="text-destructive text-xs" role="alert">
							{serverError}
						</p>
					) : null}

					<DialogFooter className="items-center gap-2 sm:justify-between">
						{isEdit ? (
							<Button
								// The shared destructive variant is 4.19:1 in light mode; mixing
								// in the foreground token brings this label above 4.5:1.
								className="text-[color-mix(in_oklch,var(--destructive)_75%,var(--foreground))] dark:text-destructive"
								disabled={remove.isPending}
								onClick={handleDelete}
								type="button"
								variant="destructive"
							>
								{confirmingDelete ? m.entry_delete_confirm() : m.entry_delete()}
							</Button>
						) : (
							<span />
						)}
						<div className="flex gap-2">
							<Button onClick={onClose} type="button" variant="outline">
								{m.entry_cancel()}
							</Button>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button disabled={isSubmitting} type="submit">
										{isSubmitting ? m.entry_saving() : m.entry_save()}
									</Button>
								)}
							</form.Subscribe>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Label + control, plus an error line when `errorId` is given. The error
 * line keeps its one-line height even when empty, so a validation message
 * appears in place instead of shifting the fields below it.
 */
function FieldBlock({
	children,
	errorId,
	errors = [],
}: {
	children: ReactNode;
	errorId?: string;
	errors?: unknown[];
}) {
	return (
		<div className="grid content-start gap-1.5">
			{children}
			{errorId ? (
				<p className="min-h-4 text-destructive text-xs leading-4" id={errorId}>
					{errors.filter(Boolean).map(String).join(" ")}
				</p>
			) : null}
		</div>
	);
}

interface CategoryPickerProps {
	categories: CategoryIndex;
	onChange: (ids: string[]) => void;
	selected: string[];
}

/**
 * Toggle chips for the user's categories, plus inline creation. Categories
 * already on the entry but since deleted stay listed (so they can be removed)
 * but can't be re-added.
 */
function CategoryPicker({
	categories,
	onChange,
	selected,
}: CategoryPickerProps) {
	const shown: Category[] = [
		...categories.active,
		...selected
			.map((id) => categories.byId.get(id))
			.filter(
				(category): category is Category =>
					category !== undefined && category.deletedAt !== null
			),
	];
	const atLimit = selected.length >= MAX_CATEGORIES;

	const toggle = (id: string) =>
		onChange(
			selected.includes(id)
				? selected.filter((value) => value !== id)
				: [...selected, id]
		);

	return (
		<fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
			<legend className="mb-2 font-medium text-xs">
				{m.entry_categories()}
			</legend>
			{shown.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{shown.map((category) => {
						const pressed = selected.includes(category.id);
						return (
							<Button
								aria-pressed={pressed}
								className="aria-pressed:bg-primary aria-pressed:text-primary-foreground dark:aria-pressed:bg-primary"
								disabled={!pressed && (atLimit || category.deletedAt !== null)}
								key={category.id}
								onClick={() => toggle(category.id)}
								size="sm"
								type="button"
								variant="outline"
							>
								<span
									aria-hidden="true"
									className={cn(
										"size-2.5 shrink-0 rounded-[2px] border border-border",
										CATEGORY_SWATCH[category.color]
									)}
								/>
								<span className={cn(category.deletedAt && "line-through")}>
									{category.name}
								</span>
							</Button>
						);
					})}
				</div>
			) : null}
			{atLimit ? (
				<p className="text-muted-foreground text-xs">
					{m.entry_category_limit()}
				</p>
			) : null}
			<NewCategory
				onCreated={(category) => {
					if (!atLimit) {
						onChange([...selected, category.id]);
					}
				}}
			/>
		</fieldset>
	);
}

/** Inline "new category" row. Not a nested <form>: Enter here must not submit the entry. */
function NewCategory({
	onCreated,
}: {
	onCreated: (category: Category) => void;
}) {
	const { createCategory } = useEntryMutations();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [color, setColor] = useState<CategoryColor>("powder");
	const [error, setError] = useState<string | null>(null);
	const ids = useId();
	// After a category is added the inline form unmounts; focus goes back to
	// the button that opened it instead of falling to the dialog container.
	const restoreFocus = useRef(false);
	const focusOnRemount = useCallback((node: HTMLButtonElement | null) => {
		if (node && restoreFocus.current) {
			restoreFocus.current = false;
			node.focus();
		}
	}, []);

	const submit = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setError(m.entry_error_name());
			return;
		}
		setError(null);
		try {
			const category = await createCategory.mutateAsync({
				color,
				name: trimmed,
			});
			onCreated(category);
			setName("");
			setColor("powder");
			restoreFocus.current = true;
			setOpen(false);
		} catch (caught) {
			setError(errorMessage(caught));
		}
	};

	if (!open) {
		return (
			<Button
				className="w-fit"
				onClick={() => setOpen(true)}
				ref={focusOnRemount}
				size="sm"
				type="button"
				variant="ghost"
			>
				<PlusIcon aria-hidden="true" />
				{m.entry_new_category()}
			</Button>
		);
	}

	return (
		<div className="grid gap-2 rounded-md border-2 border-border border-dashed p-2">
			<Label htmlFor={`${ids}-name`}>{m.entry_category_name()}</Label>
			<div className="flex gap-2">
				<Input
					aria-describedby={`${ids}-error`}
					aria-invalid={error !== null}
					autoComplete="off"
					// Opened by an explicit click, so moving focus here is expected.
					autoFocus
					id={`${ids}-name`}
					maxLength={MAX_CATEGORY_NAME}
					name="categoryName"
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						} else if (event.key === "Escape") {
							// Esc peels one layer: close this inline form, not the dialog.
							event.preventDefault();
							event.stopPropagation();
							restoreFocus.current = true;
							setOpen(false);
						}
					}}
					value={name}
				/>
				<Button
					disabled={createCategory.isPending}
					onClick={submit}
					type="button"
					variant="secondary"
				>
					{m.entry_category_add()}
				</Button>
			</div>
			<fieldset className="m-0 min-w-0 border-0 p-0">
				<legend className="mb-1.5 text-muted-foreground text-xs">
					{m.entry_category_color()}
				</legend>
				<div className="flex flex-wrap gap-1.5">
					{CATEGORY_COLORS.map((option) => (
						<label
							className="relative cursor-pointer rounded-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
							key={option}
						>
							<input
								checked={color === option}
								className="peer sr-only"
								name={`${ids}-color`}
								onChange={() => setColor(option)}
								type="radio"
								value={option}
							/>
							<span
								aria-hidden="true"
								className={cn(
									"block size-6 rounded-sm border-2 border-border transition-transform duration-100 peer-checked:scale-110 peer-checked:shadow-brutal-sm motion-reduce:transition-none",
									CATEGORY_SWATCH[option]
								)}
							/>
							<span className="sr-only">{COLOR_LABEL[option]()}</span>
						</label>
					))}
				</div>
			</fieldset>
			<p
				className="min-h-4 text-destructive text-xs leading-4"
				id={`${ids}-error`}
			>
				{error}
			</p>
		</div>
	);
}

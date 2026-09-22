import type { Meta, StoryObj } from "@storybook/react-vite";

const meta: Meta = {
	parameters: {
		layout: "padded",
	},
	title: "Foundations/Colors & Texture",
};
export default meta;
type Story = StoryObj;

const swatches: Array<{ name: string; token: string }> = [
	{ name: "background", token: "bg-background text-foreground border-border" },
	{ name: "card", token: "bg-card text-card-foreground border-border" },
	{
		name: "primary (espresso)",
		token: "bg-primary text-primary-foreground border-border",
	},
	{
		name: "accent (powder blue)",
		token: "bg-accent text-accent-foreground border-border",
	},
	{
		name: "secondary",
		token: "bg-secondary text-secondary-foreground border-border",
	},
	{ name: "muted", token: "bg-muted text-muted-foreground border-border" },
	{
		name: "destructive",
		token: "bg-destructive text-destructive-foreground border-border",
	},
	{
		name: "success (new)",
		token: "bg-success text-success-foreground border-border",
	},
];

export const ColorTokens: Story = {
	render: () => (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{swatches.map((s) => (
				<div className="space-y-2" key={s.name}>
					<div
						className={`flex h-20 items-center justify-center rounded-md border-2 font-mono text-xs ${s.token}`}
					>
						Aa
					</div>
					<p className="font-medium text-sm">{s.name}</p>
				</div>
			))}
		</div>
	),
};

export const FocusVsBorder: Story = {
	name: "Focus ring vs. resting border",
	parameters: {
		docs: {
			description: {
				story:
					"The resting border (ink brown, `--border`) and the focus ring (saturated blue, `--ring`) are deliberately different hues so keyboard focus is never ambiguous against a UI that already shows visible borders everywhere. Tab into the box below to see the ring appear.",
			},
		},
	},
	render: () => (
		<button
			className="rounded-md border-2 border-border bg-card px-4 py-3 text-sm shadow-brutal-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			type="button"
		>
			Tab to me, then compare the resting border to the focus ring
		</button>
	),
};

export const HardOffsetShadow: Story = {
	name: "Hard offset shadow scale",
	render: () => (
		<div className="flex flex-wrap gap-8">
			{(["shadow-brutal-sm", "shadow-brutal", "shadow-brutal-lg"] as const).map(
				(cls) => (
					<div className="space-y-2 text-center" key={cls}>
						<div
							className={`flex h-16 w-16 items-center justify-center rounded-md border-2 border-border bg-card ${cls}`}
						/>
						<p className="font-mono text-muted-foreground text-xs">{cls}</p>
					</div>
				)
			)}
		</div>
	),
};

export const GrainTexture: Story = {
	name: "Grain (decorative surfaces only)",
	parameters: {
		docs: {
			description: {
				story:
					"`.grain` is a cheap, static feTurbulence noise layer for decorative/low-density surfaces (auth screens, empty states) - never for scrolling tables/lists or the dashboard. Its opacity is capped low enough to never drop text contrast below the measured ratio, and it auto-hides under `prefers-contrast: more`.",
			},
		},
	},
	render: () => (
		<div className="grid grid-cols-2 gap-6">
			<div className="grain rounded-md border-2 border-border bg-card p-6">
				<p className="font-medium">With .grain</p>
				<p className="text-muted-foreground text-sm">
					Decorative surfaces only.
				</p>
			</div>
			<div className="rounded-md border-2 border-border bg-card p-6">
				<p className="font-medium">Without .grain</p>
				<p className="text-muted-foreground text-sm">
					Dense/scrolling surfaces (tables, dashboard).
				</p>
			</div>
		</div>
	),
};

export const TimeDisplay: Story = {
	name: "Numeric / time display (Space Mono)",
	parameters: {
		docs: {
			description: {
				story:
					"Durations, timers, and timestamps use `font-mono` (Space Mono) - monospace digits are inherently tabular, satisfying the Web Interface Guidelines' tabular-nums requirement for free, while giving the time-tracker's numbers an intentional, editorial feel.",
			},
		},
	},
	render: () => (
		<div className="flex items-baseline gap-2 font-mono text-4xl tabular-nums">
			<span>02:47:16</span>
			<span className="text-base text-muted-foreground">elapsed</span>
		</div>
	),
};

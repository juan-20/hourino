import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/button";

const meta: Meta<typeof Button> = {
	args: {
		children: "Click me",
	},
	argTypes: {
		size: {
			control: "select",
			options: [
				"xs",
				"sm",
				"default",
				"lg",
				"icon-xs",
				"icon-sm",
				"icon",
				"icon-lg",
			],
		},
		variant: {
			control: "select",
			options: [
				"default",
				"destructive",
				"outline",
				"secondary",
				"ghost",
				"link",
			],
		},
	},
	component: Button,
	parameters: {
		docs: {
			description: {
				component:
					'`default`/`destructive`/`outline`/`secondary` are "physical" buttons: a 2px ink border, a hard offset shadow, and a tactile press (the shadow collapses and the button translates toward it on `:active`). `ghost`/`link` stay flat and borderless by design - not every control needs the full brutalist treatment. Try `prefers-reduced-motion` in your OS/browser settings: the press still happens instantly, just without the animated transition.',
			},
		},
	},
	title: "Components/Button",
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const AllVariants: Story = {
	render: () => (
		<div className="flex flex-wrap gap-3">
			<Button variant="default">Default</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="link">Link</Button>
		</div>
	),
};

export const Sizes: Story = {
	render: () => (
		<div className="flex flex-wrap items-center gap-3">
			<Button size="xs">Extra small</Button>
			<Button size="sm">Small</Button>
			<Button size="default">Default</Button>
			<Button size="lg">Large</Button>
		</div>
	),
};

export const Disabled: Story = {
	args: { disabled: true },
};

export const PressInteraction: Story = {
	name: "Press interaction (click and hold)",
	render: () => <Button variant="default">Press and hold me</Button>,
};

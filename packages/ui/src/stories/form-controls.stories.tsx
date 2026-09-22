import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "../components/checkbox";
import { Input } from "../components/input";
import { Label } from "../components/label";
import { Switch } from "../components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs";

const meta: Meta = {
	parameters: { layout: "padded" },
	title: "Components/Form Controls",
};
export default meta;
type Story = StoryObj;

export const TextInput: Story = {
	render: () => (
		<div className="grid w-72 gap-2">
			<Label htmlFor="story-project">Project name</Label>
			<Input id="story-project" placeholder="e.g. Acme redesign" />
		</div>
	),
};

export const InvalidInput: Story = {
	name: "Input (invalid state)",
	render: () => (
		<div className="grid w-72 gap-2">
			<Label htmlFor="story-email">Email</Label>
			<Input aria-invalid="true" defaultValue="not-an-email" id="story-email" />
			<p className="text-destructive text-sm">Enter a valid email address.</p>
		</div>
	),
};

export const CheckboxAndSwitch: Story = {
	name: "Checkbox & Switch",
	render: () => (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Checkbox defaultChecked id="story-checkbox" />
				<Label htmlFor="story-checkbox">Billable time</Label>
			</div>
			<div className="flex items-center gap-2">
				<Switch defaultChecked id="story-switch" />
				<Label htmlFor="story-switch">Round to nearest 15 minutes</Label>
			</div>
		</div>
	),
};

export const TabsExample: Story = {
	name: "Tabs",
	render: () => (
		<Tabs className="w-80" defaultValue="week">
			<TabsList>
				<TabsTrigger value="week">This week</TabsTrigger>
				<TabsTrigger value="month">This month</TabsTrigger>
			</TabsList>
			<TabsContent value="week">
				<p className="font-mono text-sm tabular-nums">32h 14m logged</p>
			</TabsContent>
			<TabsContent value="month">
				<p className="font-mono text-sm tabular-nums">128h 05m logged</p>
			</TabsContent>
		</Tabs>
	),
};

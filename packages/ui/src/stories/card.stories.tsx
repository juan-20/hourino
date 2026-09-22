import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../components/card";

const meta: Meta<typeof Card> = {
	component: Card,
	parameters: { layout: "centered" },
	title: "Components/Card",
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
	render: () => (
		<Card className="w-80">
			<CardHeader>
				<CardTitle>Acme Project</CardTitle>
				<CardDescription>Time tracked this week</CardDescription>
				<CardAction>
					<Badge variant="secondary">Active</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				<p className="font-mono text-2xl tabular-nums">14:32:07</p>
			</CardContent>
			<CardFooter className="gap-2">
				<Button size="sm" variant="outline">
					Details
				</Button>
				<Button size="sm">Log time</Button>
			</CardFooter>
		</Card>
	),
};

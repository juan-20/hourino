import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import "../src/styles/globals.css";

const withTheme: Decorator = (Story, context) => {
	const theme = context.globals.theme ?? "light";
	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
	}, [theme]);
	return (
		<div className="bg-background p-6 text-foreground">
			<Story />
		</div>
	);
};

const preview: Preview = {
	decorators: [withTheme],
	globalTypes: {
		theme: {
			description:
				"Light / dark theme (Hourino's Balanced Riso-Neobrutalism tokens)",
			toolbar: {
				dynamicTitle: true,
				icon: "circlehollow",
				items: [
					{ title: "Light", value: "light" },
					{ title: "Dark", value: "dark" },
				],
				title: "Theme",
			},
		},
	},
	initialGlobals: {
		theme: "light",
	},
	parameters: {
		backgrounds: { disable: true },
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
};

export default preview;

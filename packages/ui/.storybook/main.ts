import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

/**
 * Resolves the absolute path of a package - needed in monorepos so Storybook's
 * addon/framework resolution doesn't depend on hoisting.
 */
function getAbsolutePath(value: string) {
	return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
	addons: [
		getAbsolutePath("@chromatic-com/storybook"),
		getAbsolutePath("@storybook/addon-vitest"),
		getAbsolutePath("@storybook/addon-a11y"),
		getAbsolutePath("@storybook/addon-docs"),
		getAbsolutePath("@storybook/addon-mcp"),
	],
	framework: getAbsolutePath("@storybook/react-vite"),
	stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
	viteFinal(viteConfig) {
		return mergeConfig(viteConfig, {
			plugins: [tailwindcss()],
			resolve: {
				tsconfigPaths: true,
			},
		});
	},
};
export default config;

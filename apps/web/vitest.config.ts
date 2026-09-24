import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: unit tests cover pure logic in
// src/lib and don't need the router/Paraglide/Tailwind plugins.
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});

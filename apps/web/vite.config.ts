import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			emitTsDeclarations: true,
			outdir: "./src/paraglide",
			project: "./project.inlang",
			// custom-browserLanguage is defined in src/lib/i18n.ts (maps pt-PT/pt -> pt-BR).
			strategy: ["localStorage", "custom-browserLanguage", "baseLocale"],
		}),
		tailwindcss(),
		tanstackRouter({
			autoCodeSplitting: true,
			target: "react",
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		port: 3001,
	},
});

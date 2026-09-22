"use strict";
module.exports = {
	forbidden: [
		{
			comment:
				"Domain/application layers must stay persistence-agnostic — depend on abstractions, not Drizzle/infra implementations directly.",
			from: { path: "(^|/)(domain|application)/" },
			name: "no-domain-to-infrastructure",
			severity: "error",
			to: { path: "(^|/)infrastructure/" },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		enhancedResolveOptions: {
			conditionNames: ["import", "require", "types", "node"],
			exportsFields: ["exports"],
		},
		exclude: "(^|/)(node_modules|dist|\\.turbo|\\.alchemy)/",
		tsConfig: { fileName: "tsconfig.json" },
		tsPreCompilationDeps: true,
	},
};

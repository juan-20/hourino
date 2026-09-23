import {
	defineCustomClientStrategy,
	type Locale,
	locales,
	toLocale,
} from "@/paraglide/runtime";

/**
 * Browser-language detection that also maps regional variants we don't ship
 * (e.g. `pt-PT`, bare `pt`) onto the closest locale we do (`pt-BR`).
 *
 * Paraglide's built-in `preferredLanguage` strategy only matches exact tags,
 * so a Portuguese browser outside Brazil would silently fall back to English.
 * Registered as `custom-browserLanguage` in vite.config.ts's `strategy` list;
 * this module must be imported before the first `getLocale()` call.
 */
export function matchBrowserLocale(
	languages: readonly string[]
): Locale | undefined {
	for (const tag of languages) {
		const exact = toLocale(tag);
		if (exact) {
			return exact;
		}
		const base = tag.split("-")[0].toLowerCase();
		const sameLanguage = locales.find(
			(locale) => locale.split("-")[0].toLowerCase() === base
		);
		if (sameLanguage) {
			return sameLanguage;
		}
	}
	return undefined;
}

defineCustomClientStrategy("custom-browserLanguage", {
	getLocale: () => matchBrowserLocale(navigator.languages ?? []),
	// Read-only: the explicit choice is persisted by the `localStorage` strategy.
	setLocale: () => undefined,
});

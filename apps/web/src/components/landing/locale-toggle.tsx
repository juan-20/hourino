import { Button } from "@hourino/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@hourino/ui/components/dropdown-menu";
import { Languages } from "lucide-react";

import { m } from "@/paraglide/messages";
import {
	getLocale,
	type Locale,
	locales,
	setLocale,
} from "@/paraglide/runtime";

// Autonyms: each language is always shown in its own name, regardless of the active locale.
const LOCALE_NAMES: Record<Locale, string> = {
	en: "English",
	"pt-BR": "Português (Brasil)",
};

function handleLocaleChange(value: unknown) {
	setLocale(value as Locale);
}

export function LocaleToggle() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button size="icon" variant="outline" />}>
				<Languages />
				<span className="sr-only">{m.nav_language()}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					onValueChange={handleLocaleChange}
					value={getLocale()}
				>
					{locales.map((locale) => (
						<DropdownMenuRadioItem key={locale} lang={locale} value={locale}>
							{LOCALE_NAMES[locale]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

import { Button } from "@hourino/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@hourino/ui/components/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useCallback } from "react";

import { useTheme } from "@/components/theme-provider";
import { m } from "@/paraglide/messages";

const THEMES = [
	{ label: m.theme_light, value: "light" },
	{ label: m.theme_dark, value: "dark" },
	{ label: m.theme_system, value: "system" },
] as const;

export function ModeToggle() {
	const { setTheme, theme } = useTheme();
	const handleThemeChange = useCallback(
		(value: unknown) => setTheme(value as string),
		[setTheme]
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button size="icon" variant="outline" />}>
				<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
				<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
				<span className="sr-only">{m.theme_toggle()}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup onValueChange={handleThemeChange} value={theme}>
					{THEMES.map(({ label, value }) => (
						<DropdownMenuRadioItem key={value} value={value}>
							{label()}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

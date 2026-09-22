"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

function Switch({
	className,
	size = "default",
	...props
}: SwitchPrimitive.Root.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SwitchPrimitive.Root
			className={cn(
				"peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 border-border shadow-brutal-sm outline-none transition-[transform,box-shadow,background-color] duration-150 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-data-disabled:translate-x-px active:not-data-disabled:translate-y-px active:not-data-disabled:shadow-none group-has-[:focus-visible]/field-label:ring-0 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=sm]:h-[14px] data-[size=default]:w-[32px] data-[size=sm]:w-[24px] data-disabled:cursor-not-allowed data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-50 motion-reduce:transition-none dark:data-unchecked:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-size={size}
			data-slot="switch"
			{...props}
		>
			<SwitchPrimitive.Thumb
				className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
				data-slot="switch-thumb"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };

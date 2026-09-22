import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border-2 border-transparent px-2 py-0.5 font-medium text-xs transition-[transform,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:transition-none dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		defaultVariants: {
			variant: "default",
		},
		variants: {
			variant: {
				default:
					"border-border bg-primary text-primary-foreground shadow-brutal-sm [a]:hover:bg-primary/80",
				destructive:
					"border-border bg-destructive/10 text-destructive shadow-brutal-sm focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				secondary:
					"border-border bg-secondary text-secondary-foreground shadow-brutal-sm [a]:hover:bg-secondary/80",
			},
		},
	}
);

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };

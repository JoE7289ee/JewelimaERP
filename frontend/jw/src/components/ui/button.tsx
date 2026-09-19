import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// shadcn's button, in the Jewelima skin: ivory hairlines on green, gold when it matters.
const button = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[12px] font-bold " +
		"transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none select-none",
	{
		variants: {
			variant: {
				ghost: "border border-ivory/25 text-ivory/85 hover:bg-ivory/5",
				gold: "bg-gradient-to-b from-champagne to-gold text-[#2B2109]",
				icon: "border border-ivory/25 text-ivory/85 hover:bg-ivory/5",
			},
			size: { sm: "h-8 px-3", md: "h-10 px-4", icon: "h-8 w-8" },
		},
		defaultVariants: { variant: "ghost", size: "sm" },
	},
);

export function Button({
	className, variant, size, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
	return <button className={cn(button({ variant, size }), className)} {...props} />;
}

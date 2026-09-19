import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** shadcn's card: a lit glass panel over the green ground. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-[18px] border border-ivory/12 bg-ivory/[0.05] p-4 shadow-[inset_0_1px_0_rgba(250,247,239,.06)]",
				className,
			)}
			{...props}
		/>
	);
}

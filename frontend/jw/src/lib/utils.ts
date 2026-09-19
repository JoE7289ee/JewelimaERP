import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class names that merge rather than fight — the shadcn helper. */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

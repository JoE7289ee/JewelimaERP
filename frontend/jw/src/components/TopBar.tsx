import { ArrowLeft, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api";

/**
 * The bar every screen carries: back, the title, a re-read and sign out.
 * The re-read spins while it works, so a press shows even when the numbers
 * come back unchanged.
 */
export function TopBar({
	title, onBack, onRefresh, busy,
}: { title: string; onBack?: () => void; onRefresh?: () => void; busy?: boolean }) {
	return (
		<div className="flex items-center gap-3 pb-3.5">
			{onBack && (
				<Button variant="icon" size="icon" className="h-10 w-10 rounded-xl" onClick={onBack} aria-label="Back">
					<ArrowLeft size={18} />
				</Button>
			)}
			<h1 className="text-[17px] font-extrabold tracking-wide">{title}</h1>
			<div className="ml-auto flex items-center gap-2">
				{onRefresh && (
					<Button variant="icon" size="icon" onClick={onRefresh} aria-label="Read it again">
						<motion.span
							animate={{ rotate: busy ? 360 : 0 }}
							transition={busy ? { repeat: Infinity, duration: 0.7, ease: "linear" } : { duration: 0 }}
							className="inline-flex"
						>
							<RotateCw size={14} />
						</motion.span>
					</Button>
				)}
				<Button onClick={signOut}>Sign out</Button>
			</div>
		</div>
	);
}

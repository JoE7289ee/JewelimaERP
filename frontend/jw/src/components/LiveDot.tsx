import { motion } from "motion/react";

/**
 * Proof the board is still being read. It breathes once on every answer —
 * keyed by the answer itself, so no answer means no breath. A board can tick
 * for a minute without a figure moving, and a screen that never changes reads
 * as a dead one.
 */
export function LiveDot({ beat }: { beat: number }) {
	return (
		<div className="flex items-center justify-end gap-2 pr-0.5 pb-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-up/85">
			<span className="relative inline-flex h-2.5 w-2.5">
				<motion.span
					key={beat}
					className="absolute inset-0 rounded-full bg-up"
					initial={{ scale: 1, opacity: 0.6 }}
					animate={{ scale: 3.2, opacity: 0 }}
					transition={{ duration: 1.4, ease: "easeOut" }}
				/>
				<motion.span
					key={`c${beat}`}
					className="relative inline-flex h-2.5 w-2.5 rounded-full bg-up"
					initial={{ scale: 0.7 }}
					animate={{ scale: [0.7, 1.25, 1] }}
					transition={{ duration: 0.6 }}
				/>
			</span>
			live
		</div>
	);
}

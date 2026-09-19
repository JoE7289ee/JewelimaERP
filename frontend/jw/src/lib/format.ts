const inr = (max: number) => (v: unknown) =>
	v == null || v === "" || Number.isNaN(Number(v))
		? "—"
		: Number(v).toLocaleString("en-IN", { maximumFractionDigits: max });

/** ₹ figures to two places, as the board quotes them. */
export const rupee = inr(2);
/** a karat figure in paise is noise on a phone — and it overflows four columns */
export const whole = inr(0);
/** grams and carats always to three places */
export const g3 = (v: unknown) =>
	(Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** a floor reads crores and lakhs, not nine digits */
export function money(v: unknown) {
	if (v == null || v === "") return "—";
	const n = Number(v);
	if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
	if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
	return `₹${whole(n)}`;
}

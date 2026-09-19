// Fixture answers for previewing the app with no server behind it (?mock=1).
// The board walks a little on each read so the move arrows have something to show.

type Fn = (args: Record<string, unknown>) => unknown;

let tick = 0;
const walk = (base: number, i: number) => base + Math.round(Math.sin(tick * 0.9 + i) * 18);

const board = () => {
	tick += 1;
	const line = (name: string, of: string, prefix: string, label: string, base: number, fine: number, i: number) => {
		const rate = walk(base, i);
		const pure = rate / fine;
		return {
			key: of.toLowerCase().replace(/ /g, ""), name, of, prefix, label, rate,
			fineness: fine, as_of: "19/09/2026 11:42:07 AM", error: "",
			by_karat: { "24K": pure * 0.999, "22K": pure * 0.916, "18K": pure * 0.75, "14K": pure * 0.585 },
		};
	};
	return {
		hero: [
			line("Chennai pure", "Shiv Sahai", "GLD CHN PURE", "GLD CHN PURE", 15749, 0.9999, 0),
			line("Thrissur 995", "Shiv Sahai", "GLD TSR 995", "GLD TSR 995", 15675, 0.995, 1),
			line("COSWAN", "Surabi Bullion", "COSWAN", "COSWAN Sept 19", 15750.5, 0.995, 2),
		],
		at: new Date().toISOString(),
	};
};

export const MOCK: Record<string, Fn> = {
	"jewelima.jewelima.api.get_jw_board": board,
};

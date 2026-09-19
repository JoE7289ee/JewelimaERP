import { TopBar } from "@/components/TopBar";
import { Chips, Kpis, Note, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3, whole } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Stone = { code: string; label: string; carat: number };
type Row = { location: string; cards: number; pieces: number; pure: number; awaiting_stones: number; stones: Stone[] };
type Floor = { rows: Row[]; totals: { cards: number; pieces: number; places: number; pure: number; carat: number } };

/** FLOOR — where the cards are, and what they carry. Actual weights, not the plan. */
export function Floor({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<Floor>("jewelima.jewelima.api.get_jw_floor"));
	return (
		<>
			<TopBar title="Floor" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The floor could not be read just now." : "Reading the floor…"}</Note> : (
				<>
					<Kpis items={[
						{ k: "Cards", v: whole(d.totals.cards) },
						{ k: "Pieces", v: whole(d.totals.pieces) },
						{ k: "Places", v: whole(d.totals.places) },
					]} />
					<div className="mt-2 flex justify-center gap-5 rounded-xl bg-ivory/[0.08] py-2.5 text-[11px] text-dim">
						<span>GOLD <b className="tabular text-[15px] text-white">{g3(d.totals.pure)}</b> pure g</span>
						<span>STONES <b className="tabular text-[15px] text-white">{g3(d.totals.carat)}</b> ct</span>
					</div>
					<Section>By location</Section>
					<div className="grid grid-cols-2 gap-2">
						{d.rows.map((r) => (
							<div key={r.location} className="rounded-[14px] border border-ivory/13 bg-ivory/[0.05] p-3">
								<div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-champagne">{r.location}</div>
								<div className="tabular mt-1 text-[23px] font-extrabold leading-tight">{whole(r.cards)} <span className="text-[11px] text-dim">card{r.cards === 1 ? "" : "s"}</span></div>
								<div className="text-[11px] text-dim">{whole(r.pieces)} piece{r.pieces === 1 ? "" : "s"}</div>
								{r.pure > 0 && <div className="tabular mt-1.5 text-[12px] font-bold">{g3(r.pure)} <span className="text-[10px] text-dim">pure g</span></div>}
								<Chips stones={r.stones} className="mt-1.5" />
								{r.awaiting_stones > 0 && <div className="mt-1.5 text-[10.5px] font-bold text-[#F2C57C]">{r.awaiting_stones} waiting on stones</div>}
							</div>
						))}
					</div>
					<p className="mt-2 text-[11px] text-dim/75">Cards still in production only — a finished piece has left the floor.</p>
				</>
			)}
		</>
	);
}

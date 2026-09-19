import { TopBar } from "@/components/TopBar";
import { Chips, Hero, Note, Rows, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3, whole } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Stone = { code: string; label: string; carat: number };
type Pack = { cards: number; pure: number; gross: number; stones: Stone[] };
type FG = {
	stock: Pack; made_today: Pack; sold_today: Pack; today: string;
	by_status: { status: string; cards: number; pure: number }[];
	by_holder: { holder: string; cards: number; pure: number; parties: number }[];
};

function Day({ x, name, verb, tint }: { x: Pack; name: string; verb: string; tint: string }) {
	return (
		<div className="rounded-[14px] border p-3" style={{ borderColor: `rgba(${tint},.32)`, background: `rgba(${tint},.10)` }}>
			<div className="text-[10px] font-extrabold uppercase tracking-[.07em] text-dim">{name}</div>
			<div className="tabular mt-1 text-[27px] font-extrabold leading-none">{whole(x.cards)} <span className="text-[11px] text-dim">piece{x.cards === 1 ? "" : "s"}</span></div>
			{x.cards ? (
				<>
					<div className="tabular mt-1.5 text-[12px] font-bold">{g3(x.pure)} <span className="text-[10px] text-dim">pure g</span></div>
					{x.stones.length ? <Chips stones={x.stones} className="mt-1.5" /> : <div className="mt-1 text-[11px] text-dim">no stones</div>}
				</>
			) : <div className="mt-2 text-[12px] text-dim">Nothing {verb} yet today.</div>}
		</div>
	);
}

/** FINISHED GOODS — made today, sold today, and the standing stock. */
export function FinishedGoods({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<FG>("jewelima.jewelima.api.get_jw_products"));
	return (
		<>
			<TopBar title="Finished Goods" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The products could not be counted just now." : "Counting the products…"}</Note> : (
				<>
					<div className="grid grid-cols-2 gap-2">
						<Day x={d.made_today} name="Made today" verb="made" tint="123,216,164" />
						<Day x={d.sold_today} name="Sold today" verb="sold" tint="212,175,55" />
					</div>
					<Section>Standing stock</Section>
					<Hero tone="blue">
						<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">Finished products</div>
						<div className="tabular mt-1 text-[30px] font-extrabold leading-none">{whole(d.stock.cards)} <span className="text-[13px] text-ivory/75">pieces</span></div>
						<div className="mt-1 text-[12px] text-dim">{g3(d.stock.pure)} pure g · {g3(d.stock.gross)} g gross</div>
						<Chips stones={d.stock.stones} className="mt-2.5" />
					</Hero>
					<Section>By status</Section>
					<Rows rows={d.by_status.map((r) => ({ key: r.status, l: r.status, s: `${g3(r.pure)} pure g`, v: whole(r.cards) }))} />
					<Section>Who holds them</Section>
					<Rows rows={d.by_holder.map((r) => ({
						key: r.holder, v: whole(r.cards), s: `${g3(r.pure)} pure g`,
						l: <>{r.holder}{r.parties > 1 && <span className="text-[11px] font-medium text-dim"> · {r.parties} counters</span>}</>,
					}))} />
					<p className="mt-2 text-[11px] text-dim/75">Sold and cancelled pieces have left this screen. Today is {d.today}.</p>
				</>
			)}
		</>
	);
}

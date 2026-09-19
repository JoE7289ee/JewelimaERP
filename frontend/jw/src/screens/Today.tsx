import { TopBar } from "@/components/TopBar";
import { Bar, Hero, Kpis, Note, Rows, Section } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3, whole } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

type Bench = { location: string; issued: number; done: number; loss: number; open_now: number; queue_now: number };
type Day = {
	today: string; rows: Bench[]; people: { who: string; done: number; issued: number }[];
	totals: { issued: number; done: number; loss: number; open_now: number; benches: number; hands: number };
};
const ISSUE = "#F2C57C", DONE = "#7BD8A4";

/** TODAY — the day across every bench: issued against done, in hand, loss booked. */
export function Today({ onBack }: { onBack: () => void }) {
	const { data: d, error, busy, reload } = useLoad(() => call<Day>("jewelima.jewelima.api.get_jw_day"));
	const peak = d ? Math.max(1, ...d.rows.map((r) => Math.max(r.issued, r.done))) : 1;
	const lossRows = d ? d.rows.filter((r) => r.loss > 0).sort((a, b) => b.loss - a.loss) : [];
	return (
		<>
			<TopBar title="Today" onBack={onBack} onRefresh={reload} busy={busy} />
			{!d ? <Note tone={error ? "bad" : "soft"}>{error ? "The day could not be read just now." : "Reading the day…"}</Note> : (
				<>
					<Kpis items={[
						{ k: "Issued", v: whole(d.totals.issued), tone: ISSUE },
						{ k: "Done", v: whole(d.totals.done), tone: DONE },
						{ k: "In hand", v: whole(d.totals.open_now) },
					]} />
					<div className="mt-2 flex justify-center gap-5 rounded-xl bg-ivory/[0.08] py-2.5 text-[11px] text-dim">
						<span>HANDS <b className="text-[15px] text-white">{d.totals.hands}</b></span>
						<span>BENCHES <b className="text-[15px] text-white">{d.totals.benches}</b></span>
						<span>LOSS <b className="tabular text-[15px] text-white">{g3(d.totals.loss)}</b> g</span>
					</div>

					<Section>Bench by bench</Section>
					<div className="-mt-1 mb-2 flex gap-4 text-[10.5px] text-dim">
						<span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: ISSUE }} />issued today</span>
						<span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: DONE }} />done today</span>
					</div>
					<div className="rounded-[13px] border border-ivory/12 px-3">
						{d.rows.map((r) => (
							<div key={r.location} className="border-b border-ivory/[0.08] py-2.5 last:border-b-0">
								<div className="flex items-baseline gap-2">
									<span className="flex-1 text-[13.5px] font-extrabold tracking-wide">{r.location}</span>
									<span className="tabular text-[15px] font-extrabold" style={{ color: ISSUE }}>{r.issued}</span>
									<span className="text-[11px] text-ivory/30">issued ·</span>
									<span className="tabular text-[15px] font-extrabold" style={{ color: DONE }}>{r.done}</span>
									<span className="text-[11px] text-ivory/30">done</span>
								</div>
								{(r.issued > 0 || r.done > 0) && (
									<div className="mt-1.5 flex h-[5px] gap-1">
										<span className="rounded" style={{ width: `${(r.issued / peak) * 50}%`, background: ISSUE }} />
										<span className="rounded" style={{ width: `${(r.done / peak) * 50}%`, background: DONE }} />
									</div>
								)}
								<div className="mt-1 text-[10.5px] text-dim">
									{[r.open_now ? `${r.open_now} in hand now` : "", r.queue_now ? `${r.queue_now} waiting` : "",
										r.loss ? `${g3(r.loss)} g loss booked` : ""].filter(Boolean).join(" · ") || "nothing moving"}
								</div>
							</div>
						))}
					</div>

					<Section>Loss booked today</Section>
					{d.totals.loss > 0 ? (
						<>
							<Hero tone="red">
								<div className="text-[11px] font-extrabold uppercase tracking-[.07em] text-dim">Booked at the benches</div>
								<div className="tabular mt-1 text-[26px] font-extrabold leading-none">{g3(d.totals.loss)} <span className="text-[13px] text-ivory/75">g</span></div>
								<div className="mt-1 text-[12px] text-dim">across {lossRows.length} bench{lossRows.length === 1 ? "" : "es"}</div>
							</Hero>
							<div className="mt-2.5 rounded-[13px] border border-ivory/12 px-3">
								{lossRows.map((r) => (
									<div key={r.location} className="border-b border-ivory/[0.08] py-2.5 last:border-b-0">
										<div className="flex items-baseline gap-2">
											<span className="flex-1 text-[13px] font-semibold">{r.location}</span>
											<span className="text-[11px] text-dim">{r.done} done</span>
											<span className="tabular text-[14.5px] font-extrabold">{g3(r.loss)}</span>
										</div>
										<Bar pct={(r.loss / lossRows[0].loss) * 100} colour="linear-gradient(90deg,#F0AFAF,#E58FA8)" />
									</div>
								))}
							</div>
							<p className="mt-2 text-[11px] text-dim/75">Issue and receipt are one record at one bench, so a bench's loss is always its own.</p>
						</>
					) : <p className="text-[11px] text-dim/75">Nothing booked yet today.</p>}

					{d.people.length > 0 && (
						<>
							<Section>Whose hands</Section>
							<Rows rows={d.people.map((p) => ({ key: p.who, l: p.who, s: `${p.issued} taken`, v: p.done }))} />
						</>
					)}
					<p className="mt-2 text-[11px] text-dim/75">{d.today} · issued and done are counted at the bench they happened at, so they need not match.</p>
				</>
			)}
		</>
	);
}

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ScanLine } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Camera } from "@/components/Camera";
import { Card } from "@/components/ui/card";
import { Note } from "@/components/ui/bits";
import { call } from "@/lib/api";
import { g3 } from "@/lib/format";
import { cn } from "@/lib/utils";

type Bag = Record<string, any>;
type Passport = { bag?: Bag; bench?: { status?: string; employee_name?: string; employee?: string; since?: string }; contents?: { items: { item: string; pcs: number; qty: number; uom: string }[] } };

/** a bare number is an E-card: 114.1.1 means E0114.1.1, as on the desk */
export function normaliseCode(raw: string) {
	let code = (raw || "").trim().toUpperCase();
	if (/^\d/.test(code)) {
		const p = code.split(".");
		if (/^\d+$/.test(p[0])) code = "E" + p[0].padStart(4, "0") + (p.length > 1 ? "." + p.slice(1).join(".") : "");
	}
	return code;
}

const BUCKETS: [string, string][] = [["DMD", "dmd"], ["PS", "ps"], ["CS", "cs"], ["CZ", "cz"], ["CVD", "cvd"], ["SW", "sw"], ["PD", "pdmd"], ["PO", "poth"]];

function Row({ t, children }: { t: string; children: React.ReactNode }) {
	if (!children) return null;
	return (
		<div className="border-b border-ivory/[0.08] py-2.5 last:border-b-0">
			<div className="text-[10px] font-extrabold uppercase tracking-[.07em] text-dim">{t}</div>
			<div className="mt-0.5 text-[13.5px] leading-snug">{children}</div>
		</div>
	);
}

/**
 * CARD INFO — scan a card with the phone's camera, or type it, and read it:
 * where it is now and who holds it, its weights, its stones, what it holds.
 */
export function CardInfo({ onBack, initial, startCamera }: { onBack: () => void; initial?: string; startCamera?: boolean }) {
	const [code, setCode] = useState(initial ? normaliseCode(initial) : "");
	const [typed, setTyped] = useState("");
	const [d, setD] = useState<Passport | null>(null);
	const [state, setState] = useState<"idle" | "busy" | "none" | "bad">("idle");
	const [cam, setCam] = useState(!!startCamera);

	const read = useCallback(async (c: string) => {
		if (!c) return;
		setCode(c); setState("busy");
		try {
			const r = await call<Passport>("jewelima.jewelima.api.get_card_passport", { order_bag: c });
			if (!r.bag) { setD(null); setState("none"); return; }
			setD(r); setState("idle");
		} catch { setState("bad"); }
	}, []);

	useEffect(() => { if (initial) read(normaliseCode(initial)); }, [initial, read]);
	const onScanned = useCallback((t: string) => { setCam(false); read(normaliseCode(t)); }, [read]);

	const b = d?.bag ?? {};
	const f = (v: unknown) => parseFloat(String(v)) || 0;
	const status = b.is_finished ? ["prod", `Product — ${b.stock_status || "In Stock"}`]
		: f(b.act_gross_weight) ? ["wip", "In production"] : ["pre", "In preproduction"];
	const stones = BUCKETS.map(([lb, k]) => {
		const no = b[`act_${k}_no`], w = b[`act_${k}_weight`];
		return no || f(w) ? `${lb} ${no || 0}/${g3(w)} ct` : "";
	}).filter(Boolean).join(" · ");
	const weights = [f(b.act_gross_weight) && `Gross ${g3(b.act_gross_weight)} g`, f(b.act_nett_weight) && `Nett ${g3(b.act_nett_weight)} g`,
		f(b.act_pure_weight) && `Pure ${g3(b.act_pure_weight)} g`].filter(Boolean).join(" · ");
	const party = b.party_group || b.held_by_group || b.customer || b.held_by || "";

	return (
		<>
			<TopBar title="Card Info" onBack={onBack} />
			<form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); read(normaliseCode(typed)); setTyped(""); }}>
				<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Scan or type a card…"
					onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(normaliseCode(typed)); setTyped(""); } }}
					enterKeyHint="go" autoCapitalize="characters" autoComplete="off"
					className="h-12 min-w-0 flex-1 rounded-xl border border-ivory/18 bg-ivory/[0.07] px-4 text-[16px] font-semibold text-ivory outline-none placeholder:text-ivory/40 focus:border-champagne" />
				<button type="button" onClick={() => setCam(true)} aria-label="Scan with the camera"
					className="flex h-12 w-12 items-center justify-center rounded-xl border border-ivory/22 bg-ivory/[0.07] text-champagne active:scale-95">
					<ScanLine size={20} />
				</button>
			</form>

			{state === "busy" && <Note>Reading {code}…</Note>}
			{state === "none" && <Note tone="bad">No card {code}.</Note>}
			{state === "bad" && <Note tone="bad">Could not read {code}.</Note>}
			{state === "idle" && !d && <Note>Scan a card, or type its number.</Note>}

			{state === "idle" && d?.bag && (
				<>
					<div className="mb-3">
						<div className="text-[24px] font-extrabold tracking-[.03em]">{b.name}</div>
						<div className="text-[12.5px] text-ivory/85">{b.design}{b.design_type ? ` · ${b.design_type}` : ""}</div>
						<span className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.05em]",
							status[0] === "prod" ? "bg-up/20 text-up" : status[0] === "wip" ? "bg-gold/20 text-champagne" : "bg-ivory/14 text-ivory/75")}>
							{status[1]}
						</span>
					</div>
					<Card className="mb-3">
						<div className="text-[10px] font-extrabold uppercase tracking-[.07em] text-dim">Where it is now</div>
						<div className="mt-0.5 text-[22px] font-extrabold text-champagne">{b.location || "—"}</div>
						{b.stock_status && <div className="text-[12.5px] text-ivory/85">{b.stock_status}</div>}
						{d.bench && <div className="text-[12.5px] text-ivory/85">{d.bench.status === "Issued"
							? <>Issued to <b>{d.bench.employee_name || d.bench.employee}</b>{d.bench.since ? ` · since ${d.bench.since}` : ""}</>
							: d.bench.status || "In Queue"}</div>}
					</Card>
					<div className="rounded-[13px] border border-ivory/12 px-3.5">
						<Row t="Weights now">{weights || "No actual weight yet"}</Row>
						<Row t="Stones">{stones}</Row>
						<Row t="Holds">{(d.contents?.items ?? []).length
							? d.contents!.items.map((m) => <div key={m.item}>{m.item} <b>{m.pcs ? `${m.pcs} / ` : ""}{m.qty}</b> {m.uom}</div>)
							: b.is_finished ? "Made into the product" : "Nothing issued yet"}</Row>
						<Row t="Party">{party && <>{party}{b.customer && party !== b.customer && <div className="text-[12px] text-dim">{b.customer}</div>}</>}</Row>
						<Row t="Order">{[b.job_order && `Job ${b.job_order}`, b.qty && `Qty ${b.qty}`, b.size && `Size ${b.size}`, b.due_date && `Due ${b.due_date}`].filter(Boolean).join(" · ")}</Row>
						<Row t="Identity">{[b.huid && `HUID ${b.huid}`, b.certifications && `Cert ${b.certifications}`].filter(Boolean).join(" · ")}</Row>
						<Row t="Remark">{b.narration}</Row>
					</div>
				</>
			)}

			<AnimatePresence>{cam && <Camera onCode={onScanned} onClose={() => setCam(false)} />}</AnimatePresence>
		</>
	);
}

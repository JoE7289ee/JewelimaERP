// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Party Stone Add — intake for CUSTOMER-GIVEN stones (the PDMD/POTH buckets).
// The twin of Party Metal Add: same party groups, same two columns, but the
// naming is LOOSE where metal's is strict — a party's stone is whatever they
// call it (VS1, RUBY), so it is typed, while party gold must be one of our own
// codes. Pick the bracket (Party Diamond / Party Other), type the stone, and
// the backend builds the item (<GROUP>-<STONE>, party group, stone type, Carat)
// — created on demand, never in sieve runs.
//
// This page lived at /app/party-stock until 607b9d1 wrote the Stock by Party
// report over it — both were called some variation of "party stock" and the
// report landed on the desk instead of beside it. It has its own route now so
// the two can never collide again.
// Route: /app/party-stone

frappe.pages["party-stone"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Party Stone Add", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { parties: [], party: "", stones: [] };

	$(page.main).append(`
		<style>
		.pst-wrap{display:flex;gap:14px;align-items:flex-start;}
		.pst-col{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);}
		.pst-parties{flex:0 0 340px;}
		.pst-main{flex:1 1 auto;}
		.pst-colhead{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-color);font-weight:700;}
		.pst-colhead .btn{margin-left:auto;}
		.pst-list{max-height:calc(100vh - 260px);overflow:auto;}
		.pst-party{display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;font-size:13px;}
		.pst-party:hover{background:var(--control-bg);}
		.pst-party.sel{background:var(--control-bg);box-shadow:inset 3px 0 0 var(--primary);}
		.pst-party .code{font-weight:800;letter-spacing:.5px;min-width:44px;}
		.pst-party .cnt{margin-left:auto;background:var(--control-bg);border:1px solid var(--border-color);border-radius:10px;padding:0 8px;font-size:11px;color:var(--text-muted);}
		.pst-empty{padding:16px;text-align:center;color:var(--text-muted);font-size:13px;}
		.pst-form{padding:12px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--border-color);}
		.pst-formrow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}
		.pst-f label{display:block;font-size:11px;color:var(--text-muted);margin:0 0 2px;}
		.pst-f input,.pst-f select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.pst-stone-in{width:220px;text-transform:uppercase;}
		.pst-preview{font-size:13px;padding:4px 10px;height:30px;line-height:22px;border-radius:5px;background:var(--control-bg);font-weight:700;letter-spacing:.3px;min-width:150px;}
		.pst-preview.ok{color:var(--green-600,#2e7d32);}
		.pst-preview.bad{color:#b52a2a;}
		.pst-add{height:30px;}
		.pst-stones{max-height:calc(100vh - 360px);overflow:auto;}
		.pst-stone{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border-color);font-size:13px;}
		.pst-stone a{color:var(--text-color);}
		.pst-stone.dis a{text-decoration:line-through;color:var(--text-muted);}
		.pst-chip{background:var(--control-bg);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--text-muted);margin-left:auto;}
		.pst-chip.pdmd{background:#e8f2fd;color:#1c5da8;font-weight:700;}
		.pst-chip.poth{background:#f3e8fd;color:#6b2fa8;font-weight:700;}
		.pst-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pst-wrap">
			<div class="pst-col pst-parties">
				<div class="pst-colhead">${__("Party groups")}</div>
				<div class="pst-list pst-partylist"></div>
			</div>
			<div class="pst-col pst-main">
				<div class="pst-colhead pst-mainhead">${__("Select a party")}</div>
				<div class="pst-form" style="display:none">
					<div class="pst-formrow">
						<div class="pst-f"><label>${__("Bracket")}</label>
							<select class="pst-bracket">
								<option value="Party Diamond">PDMD — ${__("Party Diamond")}</option>
								<option value="Party Other">POTH — ${__("Party Other")}</option>
							</select></div>
						<div class="pst-f"><label>${__("Stone")}</label><input class="pst-stone-in" type="text" placeholder="VS1 / RUBY …"></div>
						<div class="pst-f"><label>${__("Item Code")}</label><div class="pst-preview">—</div></div>
						<button class="btn btn-primary btn-sm pst-add" disabled>${__("Add Stone")}</button>
					</div>
				</div>
				<div class="pst-list pst-stones"></div>
			</div>
		</div>
		<div class="pst-hint">${__("Party-given stones only — created on demand, never in sieve runs. Weights land in the PDMD/POTH columns of the bag; party gold goes through Party Metal Add.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $stoneIn = root.querySelector(".pst-stone-in");
	const $bracket = root.querySelector(".pst-bracket");
	const $preview = root.querySelector(".pst-preview");
	const $add = root.querySelector(".pst-add");

	function loadParties(selectCode) {
		frappe.call({ method: API + ".get_stone_parties" }).then((r) => {
			S.parties = r.message || [];
			if (selectCode) S.party = selectCode;
			renderParties();
			if (S.party) loadStones();
		});
	}

	function renderParties() {
		const box = root.querySelector(".pst-partylist");
		if (!S.parties.length) {
			box.innerHTML = `<div class="pst-empty">${__("No parties yet — stones can only come in under a party.")}</div>`;
			return;
		}
		box.innerHTML = S.parties.map((p) =>
			`<div class="pst-party${p.code === S.party ? " sel" : ""}" data-code="${esc(p.code)}">
				<span class="code">${esc(p.code)}</span><span>${esc(p.party_name)}</span>
				<span class="cnt">${p.items} ${__("stones")}</span>
			</div>`
		).join("");
		box.querySelectorAll(".pst-party").forEach((el) =>
			el.addEventListener("click", function () {
				S.party = this.getAttribute("data-code");
				renderParties();
				loadStones();
			})
		);
	}

	function loadStones() {
		const p = S.parties.find((x) => x.code === S.party);
		root.querySelector(".pst-mainhead").textContent = p ? `${p.code} — ${p.party_name}` : __("Select a party");
		root.querySelector(".pst-form").style.display = S.party ? "" : "none";
		if (!S.party) { root.querySelector(".pst-stones").innerHTML = ""; return; }
		frappe.call({ method: API + ".get_party_stones", args: { party: S.party } }).then((r) => {
			S.stones = r.message || [];
			renderStones();
			checkPreview();
		});
	}

	function renderStones() {
		const box = root.querySelector(".pst-stones");
		if (!S.stones.length) {
			box.innerHTML = `<div class="pst-empty">${__("No stones yet for this party.")}</div>`;
			return;
		}
		box.innerHTML = S.stones.map((s) =>
			`<div class="pst-stone${s.disabled ? " dis" : ""}">
				<a href="/app/item/${encodeURIComponent(s.name)}">${esc(s.name)}</a>
				<span class="pst-chip ${s.bracket.toLowerCase()}">${esc(s.bracket)}</span>
			</div>`
		).join("");
	}

	const checkPreview = frappe.utils.debounce(() => {
		const stone = ($stoneIn.value || "").trim();
		if (!S.party || !stone) {
			$preview.textContent = "—";
			$preview.className = "pst-preview";
			$add.disabled = true;
			return;
		}
		frappe.call({ method: API + ".check_party_stone", args: { party: S.party, stone } })
			.then((r) => {
				const m = r.message || {};
				$preview.textContent = m.item_code + (m.exists ? " — " + __("exists") : "");
				$preview.className = "pst-preview " + (m.exists ? "bad" : "ok");
				$add.disabled = !!m.exists;
			})
			.catch(() => {
				$preview.textContent = __("invalid name");
				$preview.className = "pst-preview bad";
				$add.disabled = true;
			});
	}, 250);
	$stoneIn.addEventListener("input", checkPreview);

	$add.addEventListener("click", () => {
		const stone = ($stoneIn.value || "").trim();
		if (!S.party || !stone) return;
		$add.disabled = true;
		frappe.call({ method: API + ".create_party_stone", args: { party: S.party, bracket: $bracket.value, stone } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} created", [r.message]), indicator: "green" }, 4);
				$stoneIn.value = "";
				checkPreview();
				loadParties(S.party); // refresh counts + stone list
			})
			.catch(() => { $add.disabled = false; });
	});

	loadParties();
};

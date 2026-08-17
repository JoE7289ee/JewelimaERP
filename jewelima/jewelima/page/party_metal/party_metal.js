// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Party Metal Add — intake for CUSTOMER-GIVEN gold. Shares the Stone Party codes
// with Party Stone Add, but naming is STRICT: the suffix must be one of OUR gold
// codes — a karat gold (JOS-22KYG) or a standard gold (JOS-Standard999). Items
// are created on demand under METAL -> PARTY METAL (outside the GOLD branch, so
// melt/karat pickers never mix party gold in), purity derived, Gram, no stone
// bucket. Route: /app/party-metal

frappe.pages["party-metal"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Party Metal Add", single_column: true });
	const API = "jewelima.jewelima.api";
	const S = { parties: [], party: "", metals: [], options: [] };

	$(page.main).append(`
		<style>
		.pmt-wrap{display:flex;gap:14px;align-items:flex-start;}
		.pmt-col{border:1px solid var(--border-color);border-radius:8px;background:var(--fg-color);}
		.pmt-parties{flex:0 0 340px;}
		.pmt-main{flex:1 1 auto;}
		.pmt-colhead{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-color);font-weight:700;}
		.pmt-colhead .btn{margin-left:auto;}
		.pmt-list{max-height:calc(100vh - 260px);overflow:auto;}
		.pmt-party{display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--border-color);cursor:pointer;font-size:13px;}
		.pmt-party:hover{background:var(--control-bg);}
		.pmt-party.sel{background:var(--control-bg);box-shadow:inset 3px 0 0 var(--primary);}
		.pmt-party .code{font-weight:800;letter-spacing:.5px;min-width:44px;}
		.pmt-party .cnt{margin-left:auto;background:var(--control-bg);border:1px solid var(--border-color);border-radius:10px;padding:0 8px;font-size:11px;color:var(--text-muted);}
		.pmt-empty{padding:16px;text-align:center;color:var(--text-muted);font-size:13px;}
		.pmt-form{padding:12px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--border-color);}
		.pmt-formrow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}
		.pmt-f label{display:block;font-size:11px;color:var(--text-muted);margin:0 0 2px;}
		.pmt-f input,.pmt-f select{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);padding:4px 10px;height:30px;border-radius:5px;box-sizing:border-box;color:var(--text-color);font-size:13px;}
		.pmt-preview{font-size:13px;padding:4px 10px;height:30px;line-height:22px;border-radius:5px;background:var(--control-bg);font-weight:700;letter-spacing:.3px;min-width:170px;}
		.pmt-preview.ok{color:var(--green-600,#2e7d32);}
		.pmt-preview.bad{color:#b52a2a;}
		.pmt-add{height:30px;}
		.pmt-metals{max-height:calc(100vh - 360px);overflow:auto;}
		.pmt-metal{display:flex;align-items:center;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border-color);font-size:13px;}
		.pmt-metal a{color:var(--text-color);}
		.pmt-metal.dis a{text-decoration:line-through;color:var(--text-muted);}
		.pmt-chip{background:#fdf3d8;color:#8a6d1a;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;margin-left:auto;}
		.pmt-hint{margin:10px 2px 0;color:var(--text-muted);font-size:12px;}
		</style>
		<div class="pmt-wrap">
			<div class="pmt-col pmt-parties">
				<div class="pmt-colhead">${__("Party groups")}</div>
				<div class="pmt-list pmt-partylist"></div>
			</div>
			<div class="pmt-col pmt-main">
				<div class="pmt-colhead pmt-mainhead">${__("Select a party")}</div>
				<div class="pmt-form" style="display:none">
					<div class="pmt-formrow">
						<div class="pmt-f"><label>${__("Metal (our standard codes only)")}</label><select class="pmt-metal-in"></select></div>
						<div class="pmt-f"><label>${__("Item Code")}</label><div class="pmt-preview">—</div></div>
						<button class="btn btn-primary btn-sm pmt-add" disabled>${__("Add Metal")}</button>
					</div>
				</div>
				<div class="pmt-list pmt-metals"></div>
			</div>
		</div>
		<div class="pmt-hint">${__("Party-given gold only — the name always follows our standard (22KYG… / Standard990–999), created when it actually comes in. Stones go through Party Stone Add.")}</div>
	`);

	const root = $(page.main)[0];
	const esc = frappe.utils.escape_html;
	const $metal = root.querySelector(".pmt-metal-in");
	const $preview = root.querySelector(".pmt-preview");
	const $add = root.querySelector(".pmt-add");

	function fillOptions() {
		const grp = (label, items) =>
			`<optgroup label="${esc(label)}">${items.map((o) =>
				`<option value="${esc(o.suffix)}">${esc(o.suffix)} — ${o.purity}%</option>`).join("")}</optgroup>`;
		$metal.innerHTML =
			grp(__("Karat Golds"), S.options.filter((o) => o.kind === "Karat")) +
			grp(__("Standard Golds"), S.options.filter((o) => o.kind === "Standard"));
	}

	function loadParties(selectCode) {
		frappe.call({ method: API + ".get_stone_parties" }).then((r) => {
			S.parties = r.message || [];
			if (selectCode) S.party = selectCode;
			renderParties();
			if (S.party) loadMetals();
		});
	}

	function renderParties() {
		const box = root.querySelector(".pmt-partylist");
		if (!S.parties.length) {
			box.innerHTML = `<div class="pmt-empty">${__("No parties yet — metal can only come in under a party.")}</div>`;
			return;
		}
		box.innerHTML = S.parties.map((p) =>
			`<div class="pmt-party${p.code === S.party ? " sel" : ""}" data-code="${esc(p.code)}">
				<span class="code">${esc(p.code)}</span><span>${esc(p.party_name)}</span>
				<span class="cnt">${p.items} ${__("items")}</span>
			</div>`
		).join("");
		box.querySelectorAll(".pmt-party").forEach((el) =>
			el.addEventListener("click", function () {
				S.party = this.getAttribute("data-code");
				renderParties();
				loadMetals();
			})
		);
	}

	function loadMetals() {
		const p = S.parties.find((x) => x.code === S.party);
		root.querySelector(".pmt-mainhead").textContent = p ? `${p.code} — ${p.party_name}` : __("Select a party");
		root.querySelector(".pmt-form").style.display = S.party ? "" : "none";
		if (!S.party) { root.querySelector(".pmt-metals").innerHTML = ""; return; }
		frappe.call({ method: API + ".get_party_metals", args: { party: S.party } }).then((r) => {
			S.metals = r.message || [];
			renderMetals();
			checkPreview();
		});
	}

	function renderMetals() {
		const box = root.querySelector(".pmt-metals");
		if (!S.metals.length) {
			box.innerHTML = `<div class="pmt-empty">${__("No metal yet for this party.")}</div>`;
			return;
		}
		box.innerHTML = S.metals.map((m) =>
			`<div class="pmt-metal${m.disabled ? " dis" : ""}">
				<a href="/app/item/${encodeURIComponent(m.name)}">${esc(m.name)}</a>
				<span class="pmt-chip">${m.metal_purity ? esc(m.metal_purity) + " · " : ""}${m.purity}%</span>
			</div>`
		).join("");
	}

	function checkPreview() {
		if (!S.party || !$metal.value) {
			$preview.textContent = "—";
			$preview.className = "pmt-preview";
			$add.disabled = true;
			return;
		}
		frappe.call({ method: API + ".check_party_metal", args: { party: S.party, metal: $metal.value } }).then((r) => {
			const m = r.message || {};
			$preview.textContent = m.item_code + (m.exists ? " — " + __("exists") : "");
			$preview.className = "pmt-preview " + (m.exists ? "bad" : "ok");
			$add.disabled = !!m.exists;
		});
	}
	$metal.addEventListener("change", checkPreview);

	$add.addEventListener("click", () => {
		if (!S.party || !$metal.value) return;
		$add.disabled = true;
		frappe.call({ method: API + ".create_party_metal", args: { party: S.party, metal: $metal.value } })
			.then((r) => {
				frappe.show_alert({ message: __("{0} created", [r.message]), indicator: "green" }, 4);
				loadParties(S.party); // refresh counts + metal list
			})
			.catch(() => { $add.disabled = false; });
	});

	frappe.call({ method: API + ".get_party_metal_options" }).then((r) => {
		S.options = r.message || [];
		fillOptions();
		loadParties();
	});
};

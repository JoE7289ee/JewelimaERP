// Copyright (c) 2026, efeone and contributors
// For license information, please see license.txt
//
// Training Videos — a learning page. Cards play the recorded walk-throughs, show
// which roles can actually perform each task, and flag any video that's out of
// date. Admins (System Manager / JW Manager) can add videos and mark one for
// update. Route: /app/training-videos

frappe.pages["training-videos"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: "Training Videos", single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { videos: [], categories: [], is_admin: 0, cat: "", q: "", mineOnly: false };

	$(page.main).append(`
		<style>
		#page-training-videos .container{max-width:100%;}
		.tv-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
		.tv-bar input.tv-q{border:1px solid var(--gray-400,#aeb6bf);background:var(--fg-color);color:var(--text-color);height:34px;border-radius:8px;padding:2px 12px;font-size:13px;min-width:240px;}
		.tv-cats{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px;}
		.tv-cat{border:1px solid var(--border-color);background:var(--fg-color);border-radius:20px;padding:5px 15px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--text-muted);}
		.tv-cat:hover{border-color:#1f618d;}
		.tv-cat.on{background:#1f618d;border-color:#1f618d;color:#fff;}
		.tv-mine{margin-left:auto;font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;cursor:pointer;}
		.tv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px;}
		.tv-card{border:1px solid var(--border-color);border-radius:14px;background:var(--fg-color);overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .12s,transform .12s;}
		.tv-card:hover{box-shadow:0 8px 22px rgba(0,0,0,.10);transform:translateY(-2px);}
		.tv-vid{width:100%;aspect-ratio:16/10;background:#0d1116;display:block;}
		.tv-body{padding:12px 15px 15px;display:flex;flex-direction:column;gap:8px;flex:1;}
		.tv-titrow{display:flex;align-items:flex-start;gap:8px;}
		.tv-title{font-size:15px;font-weight:800;line-height:1.25;flex:1;}
		.tv-cat-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1f618d;background:#e8f2fd;border-radius:7px;padding:2px 8px;white-space:nowrap;}
		.tv-desc{font-size:12.5px;color:var(--text-muted);line-height:1.45;}
		.tv-roles{display:flex;gap:5px;flex-wrap:wrap;margin-top:auto;}
		.tv-rlab{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);width:100%;margin-bottom:-2px;}
		.tv-role{font-size:10.5px;font-weight:700;background:var(--control-bg,#eef1f5);color:#5a6b7b;border-radius:8px;padding:1px 8px;}
		.tv-role.mine{background:#dcefe0;color:#1d7a33;}
		.tv-flags{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
		.tv-badge{font-size:9.5px;font-weight:800;border-radius:8px;padding:2px 8px;text-transform:uppercase;letter-spacing:.03em;}
		.tv-badge.upd{background:#fdecea;color:#b02a2a;}
		.tv-badge.can{background:#dcefe0;color:#1d7a33;}
		.tv-admin{display:flex;gap:8px;border-top:1px solid var(--border-color);padding-top:9px;margin-top:2px;}
		.tv-admin button{font-size:11.5px;border-radius:7px;padding:3px 10px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-muted);}
		.tv-admin .tv-mark.on{border-color:#b02a2a;color:#b02a2a;}
		.tv-admin button:hover{border-color:#1f618d;color:#1f618d;}
		.tv-dl{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#1f618d;text-decoration:none;border:1px solid var(--border-color);border-radius:8px;padding:4px 11px;align-self:flex-start;}
		.tv-dl:hover{border-color:#1f618d;background:#e8f2fd;}
		.tv-none{padding:44px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:12px;}
		</style>
		<div class="tv-bar">
			<input class="tv-q" placeholder="${__("Search training videos")}">
			<label class="tv-mine"><input type="checkbox" class="tv-minecb"> ${__("Only what my role can do")}</label>
		</div>
		<div class="tv-cats" id="tv-cats"></div>
		<div class="tv-grid" id="tv-grid"></div>
	`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".get_training_videos" }).then((r) => {
			const m = r.message || {};
			S.videos = m.videos || []; S.categories = m.categories || []; S.is_admin = m.is_admin;
			paintCats(); paint();
		});
	}

	function paintCats() {
		const chips = [`<div class="tv-cat ${S.cat === "" ? "on" : ""}" data-c="">${__("All")}</div>`]
			.concat(S.categories.map((c) => `<div class="tv-cat ${S.cat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</div>`));
		root.find("#tv-cats").html(chips.join(""));
		root.find(".tv-cat").on("click", function () { S.cat = this.getAttribute("data-c"); paintCats(); paint(); });
	}

	const visible = () => {
		const q = (S.q || "").trim().toLowerCase();
		return S.videos.filter((v) =>
			(!S.cat || (v.category || "General") === S.cat) &&
			(!S.mineOnly || v.can_do) &&
			(!q || (v.title + " " + (v.description || "") + " " + (v.category || "")).toLowerCase().indexOf(q) !== -1));
	};

	function card(v) {
		const roles = (v.roles || []).length
			? `<div class="tv-roles"><span class="tv-rlab">${__("Who can do this")}</span>` +
				v.roles.map((r) => `<span class="tv-role ${v.can_do ? "mine" : ""}">${esc(r)}</span>`).join("") + `</div>`
			: `<div class="tv-roles"><span class="tv-rlab">${__("Who can do this")}</span><span class="tv-role">${__("Everyone")}</span></div>`;
		const flags = `<div class="tv-flags">` +
			(v.can_do ? `<span class="tv-badge can">✓ ${__("You can do this")}</span>` : "") +
			(v.needs_update ? `<span class="tv-badge upd">⚠ ${__("Update needed")}</span>` : "") + `</div>`;
		const admin = S.is_admin ? `<div class="tv-admin">
			<button class="tv-mark ${v.needs_update ? "on" : ""}" data-name="${esc(v.name)}" data-on="${v.needs_update ? 1 : 0}">${v.needs_update ? __("Clear update flag") : __("Mark for update")}</button>
			<button class="tv-edit" data-name="${esc(v.name)}">${__("Edit")}</button>
		</div>` : "";
		return `<div class="tv-card">
			<video class="tv-vid" controls preload="metadata" src="${esc(v.video)}"></video>
			<div class="tv-body">
				<div class="tv-titrow"><div class="tv-title">${esc(v.title)}</div>${v.category ? `<span class="tv-cat-tag">${esc(v.category)}</span>` : ""}</div>
				${flags}
				${v.description ? `<div class="tv-desc">${esc(v.description)}</div>` : ""}
				${roles}
				<a class="tv-dl" href="${esc(v.video)}" download title="${__("Download this video")}">⬇ ${__("Download")}</a>
				${admin}
			</div>
		</div>`;
	}

	function paint() {
		const vs = visible();
		root.find("#tv-grid").html(vs.length ? vs.map(card).join("")
			: `<div class="tv-none" style="grid-column:1/-1;">${__("No training videos yet.")}${S.is_admin ? " " + __("Use “Add video” to upload one.") : ""}</div>`);
		root.find(".tv-mark").on("click", function () {
			const name = this.getAttribute("data-name");
			const on = this.getAttribute("data-on") === "1";
			frappe.call({ method: API + ".training_video_set_update", args: { name, needs_update: on ? 0 : 1 }, freeze: true })
				.then(() => { frappe.show_alert({ message: on ? __("Update flag cleared.") : __("Marked for update."), indicator: on ? "green" : "orange" }, 4); load(); });
		});
		root.find(".tv-edit").on("click", function () { frappe.set_route("Form", "Training Video", this.getAttribute("data-name")); });
	}

	root.find(".tv-q").on("input", function () { S.q = this.value; paint(); });
	root.find(".tv-minecb").on("change", function () { S.mineOnly = this.checked; paint(); });
	page.set_secondary_action(__("Refresh"), load);
	if (S.is_admin) {} // add button added after first load (need is_admin)
	frappe.call({ method: API + ".get_training_videos" }).then((r) => {
		const m = r.message || {};
		S.videos = m.videos || []; S.categories = m.categories || []; S.is_admin = m.is_admin;
		if (S.is_admin) page.add_inner_button(__("Add video"), () => frappe.new_doc("Training Video"));
		paintCats(); paint();
	});
};

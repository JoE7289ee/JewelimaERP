// Meeting Minutes — admins' meeting log: date & time, action points that tick
// off with who-and-when, and a Closed state once the business is done.
// System Manager / JW Manager only. Route: /app/meeting-minutes
frappe.pages["meeting-minutes"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Meeting Minutes"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { status: "Open", q: "", data: { rows: [], counts: {} } };

	$(page.main).append(`
		<style>
		#page-meeting-minutes .container{max-width:100%;}
		.mm-top{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px;}
		.mm-form{border:1px solid var(--border-color);border-radius:11px;background:var(--fg-color);padding:14px 16px;flex:0 0 360px;}
		.mm-form .h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;}
		.mm-form label{display:block;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:8px 0 3px;}
		.mm-form input,.mm-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:7px;padding:7px 9px;font-size:12.5px;background:var(--fg-color);color:var(--text-color);}
		.mm-form textarea{min-height:110px;resize:vertical;}
		.mm-btn{border:none;color:#fff;font-weight:800;padding:9px 18px;border-radius:8px;cursor:pointer;background:#2e7d32;margin-top:12px;width:100%;}
		.mm-pts-rows{display:flex;flex-direction:column;gap:5px;}
		.mm-pt-row{display:flex;gap:5px;align-items:center;}
		.mm-pt-row textarea{flex:1;resize:none;overflow:hidden;min-height:32px;line-height:1.35;}
		.mm-pt-row .mm-pt-who{width:92px !important;flex:0 0 auto;font-size:11px !important;padding:4px 7px !important;}
		.mm-pt-row .x{cursor:pointer;color:#b02a2a;font-weight:800;padding:0 4px;flex:0 0 auto;}
		.mm-addrow{margin-top:6px;border:1px dashed var(--border-color);border-radius:7px;background:transparent;color:#1f618d;font-weight:700;font-size:11.5px;padding:5px 10px;cursor:pointer;width:100%;}
		.mm-addrow:hover{background:var(--control-bg);}
		.mm-age{border-radius:8px;padding:0 7px;font-size:9.5px;font-weight:800;background:#fdeaea;color:#b02a2a;white-space:nowrap;flex:0 0 auto;}
		.mm-age.fresh{background:var(--control-bg);color:var(--text-muted);}
		.mm-ptiles{display:flex;gap:8px;margin-bottom:10px;}
		.mm-ptile{border:1px solid var(--border-color);border-radius:9px;padding:5px 13px;background:var(--fg-color);}
		.mm-ptile .k{font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.mm-ptile .v{font-size:15px;font-weight:800;}
		.mm-ptile.o .v{color:#8a6d00;} .mm-ptile.p .v{color:#333d8f;} .mm-ptile.c .v{color:#1d7a33;}
		.mm-side{flex:1;min-width:420px;}
		.mm-tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:center;}
		.mm-tile{border:1px solid var(--border-color);border-radius:9px;padding:6px 14px;background:var(--control-bg);cursor:pointer;}
		.mm-tile.on{border-color:#1f618d;box-shadow:0 0 0 1px #1f618d inset;}
		.mm-tile .k{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;}
		.mm-tile .v{font-size:17px;font-weight:800;}
		.mm-q{margin-left:auto;border:1px solid var(--border-color);border-radius:8px;height:32px;padding:2px 12px;background:var(--fg-color);color:var(--text-color);font-size:13px;width:220px;}
		.mm-card{border:1px solid var(--border-color);border-radius:10px;background:var(--fg-color);padding:12px 15px;margin-bottom:10px;}
		.mm-card .rh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;}
		.mm-card .rt{font-size:14.5px;font-weight:800;}
		.mm-dt{font-size:12px;font-weight:700;color:#1f618d;}
		.mm-badge{border-radius:9px;padding:1px 10px;font-size:10.5px;font-weight:800;}
		.mm-badge.Open{background:#fdf3d0;color:#8a6d00;}
		.mm-badge.Closed{background:#dcefe0;color:#1d7a33;}
		.mm-meta{font-size:11px;color:var(--text-muted);}
		.mm-pts{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
		.mm-pt{border:1px solid var(--border-color);border-radius:8px;padding:6px 9px;font-size:12.5px;background:var(--fg-color);}
		.mm-pt.Closed{background:var(--control-bg);}
		.mm-pt .r1{display:flex;gap:8px;align-items:flex-start;}
		.mm-pt .t{flex:1;white-space:pre-wrap;}
		.mm-pt.Closed .t{text-decoration:line-through;color:var(--text-muted);}
		.mm-st{border-radius:9px;padding:1px 10px;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap;flex:0 0 auto;}
		.mm-st.Open{background:#fdf3d0;color:#8a6d00;}
		.mm-st.InProcess{background:#e3e7f5;color:#333d8f;}
		.mm-st.Closed{background:#dcefe0;color:#1d7a33;}
		.mm-asg{border:1px dashed var(--border-color);border-radius:9px;padding:1px 9px;font-size:10.5px;cursor:pointer;color:var(--text-muted);white-space:nowrap;flex:0 0 auto;}
		.mm-asg.has{border-style:solid;color:var(--text-color);font-weight:700;background:var(--control-bg);}
		.mm-fu-t{cursor:pointer;font-size:10.5px;color:#1f618d;font-weight:700;white-space:nowrap;flex:0 0 auto;}
		.mm-pt .w{font-size:10px;color:var(--text-muted);white-space:nowrap;flex:0 0 auto;}
		.mm-pt .rm{cursor:pointer;color:#b02a2a;font-weight:800;visibility:hidden;flex:0 0 auto;}
		.mm-pt:hover .rm{visibility:visible;}
		.mm-fu{display:none;margin-top:6px;border-top:1px dashed var(--border-color);padding-top:6px;}
		.mm-fu.open{display:block;}
		.mm-fu-row{font-size:11.5px;padding:5px 8px;display:flex;gap:8px;border-bottom:1px solid var(--border-color);}
		.mm-fu-row:nth-child(odd){background:var(--control-bg);}
		.mm-fu-row:first-child{border-radius:6px 6px 0 0;}
		.mm-fu-row:last-of-type{border-bottom:none;border-radius:0 0 6px 6px;}
		.mm-fu-row .n{flex:1;white-space:pre-wrap;}
		.mm-fu-row .m{color:var(--text-muted);font-size:10px;white-space:nowrap;}
		.mm-fu-add{display:flex;gap:6px;margin-top:4px;}
		.mm-fu-add input{flex:1;border:1px solid var(--border-color);border-radius:6px;height:26px;padding:2px 9px;font-size:11.5px;background:var(--fg-color);color:var(--text-color);}
		.mm-addpt{display:flex;gap:6px;margin-top:7px;}
		.mm-addpt input{flex:1;border:1px solid var(--border-color);border-radius:6px;height:28px;padding:2px 10px;font-size:12px;background:var(--fg-color);color:var(--text-color);}
		.mm-note{border:1px solid var(--border-color);border-radius:6px;padding:5px 9px;font-size:11.5px;background:var(--control-bg);margin-top:7px;white-space:pre-wrap;}
		.mm-actions{margin-top:8px;border-top:1px dashed var(--border-color);padding-top:8px;display:flex;gap:6px;}
		.mm-none{padding:30px;text-align:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:10px;}
		.mm-prog{font-size:11px;font-weight:700;color:var(--text-muted);}
		</style>
		<div class="mm-top">
			<div class="mm-form">
				<div class="h">${__("New meeting")}</div>
				<label>${__("Title")}</label><input type="text" class="mm-title" placeholder="${__("what the meeting is about")}">
				<label>${__("Date & time")}</label><input type="datetime-local" class="mm-when">
				<label>${__("Points to do — one box per point")}</label>
				<div class="mm-pts-rows"></div>
				<button type="button" class="mm-addrow">+ ${__("another point")}</button>
				<label>${__("Notes (optional)")}</label>
				<textarea class="mm-note-in" style="min-height:60px;"></textarea>
				<button class="mm-btn mm-submit">${__("Create meeting")}</button>
			</div>
			<div class="mm-side">
				<div class="mm-tiles">
					<div class="mm-tile" data-s="Open"><div class="k">${__("Open")}</div><div class="v mm-c-open">0</div></div>
					<div class="mm-tile" data-s="Closed"><div class="k">${__("Closed")}</div><div class="v mm-c-closed">0</div></div>
					<div class="mm-tile" data-s=""><div class="k">${__("All")}</div><div class="v mm-c-all">0</div></div>
					<input type="text" class="mm-q" placeholder="${__("search title / notes…")}">
				</div>
				<div class="mm-ptiles">
					<div class="mm-ptile o"><div class="k">${__("Points open")}</div><div class="v mm-p-open">0</div></div>
					<div class="mm-ptile p"><div class="k">${__("In process")}</div><div class="v mm-p-proc">0</div></div>
					<div class="mm-ptile c"><div class="k">${__("Points closed")}</div><div class="v mm-p-closed">0</div></div>
				</div>
				<div class="mm-list"><div class="mm-none">${__("loading…")}</div></div>
			</div>
		</div>`);
	const root = $(page.main);

	function load() {
		frappe.call({ method: API + ".meeting_list", args: { status: S.status || null, q: S.q || null }, freeze: false })
			.then((r) => { S.data = r.message || { rows: [], counts: {} }; paint(); });
	}

	function paint() {
		const c = S.data.counts || {};
		root.find(".mm-c-open").text(c.Open || 0);
		root.find(".mm-c-closed").text(c.Closed || 0);
		root.find(".mm-c-all").text((c.Open || 0) + (c.Closed || 0));
		const pc = S.data.pt_counts || {};
		root.find(".mm-p-open").text(pc["Open"] || 0);
		root.find(".mm-p-proc").text(pc["In Process"] || 0);
		root.find(".mm-p-closed").text(pc["Closed"] || 0);
		root.find(".mm-tile").removeClass("on").filter(`[data-s="${S.status}"]`).addClass("on");
		root.find(".mm-list").html((S.data.rows || []).length ? S.data.rows.map((m) => `
			<div class="mm-card" data-n="${esc(m.name)}">
				<div class="rh">
					<span class="rt">${esc(m.title)}</span>
					<span class="mm-dt">${m.meeting_on ? frappe.datetime.str_to_user(m.meeting_on) : ""}</span>
					<span class="mm-badge ${esc(m.status)}">${esc(m.status)}</span>
					<span class="mm-prog">${m.total_pts ? __("{0}/{1} done", [m.total_pts - m.open_pts, m.total_pts]) : ""}</span>
					<span class="mm-meta" style="margin-left:auto;">${esc(m.name)} · ${esc(m.who || "")}</span>
				</div>
				<div class="mm-pts">${(m.points || []).map((p) => `
					<div class="mm-pt ${esc(p.status.replace(/\s+/g, ""))}" data-p="${esc(p.name)}">
						<div class="r1">
							<span class="mm-st ${esc(p.status.replace(/\s+/g, ""))}" data-p="${esc(p.name)}" data-s="${esc(p.status)}" title="${__("click to move: Open → In Process → Closed")}">${esc(p.status)}</span>
							<span class="t">${esc(p.point)}</span>
							${p.days_open != null ? `<span class="mm-age ${p.days_open < 3 ? "fresh" : ""}" title="${__("days since this point was raised")}">${p.days_open}d</span>` : ""}
							<span class="mm-asg ${p.assigned_to ? "has" : ""}" data-p="${esc(p.name)}" data-a="${esc(p.assigned_to || "")}" title="${__("who is answerable — click to set")}">${p.assigned_to ? "@ " + esc(p.assigned_to) : "@ " + __("assign")}</span>
							<span class="mm-fu-t" data-p="${esc(p.name)}">💬 ${(p.followups || []).length}</span>
							${p.status_by ? `<span class="w">${esc(p.status_by_name || p.status_by)} · ${esc((p.status_on || "").slice(0, 16))}</span>` : ""}
							<span class="rm" data-p="${esc(p.name)}" title="${__("remove point")}">&times;</span>
						</div>
						<div class="mm-fu ${p.status !== "Closed" ? "open" : ""}" data-p="${esc(p.name)}">
							${(p.followups || []).map((f) => `<div class="mm-fu-row"><span class="n">${esc(f.note)}</span><span class="m">${esc(f.who)} · ${esc(f.when)}</span></div>`).join("")}
							<div class="mm-fu-add"><input type="text" class="mm-fu-in" data-p="${esc(p.name)}" placeholder="${__("add a follow-up — Enter saves")}"></div>
						</div>
					</div>`).join("")}</div>
				<div class="mm-addpt">
					<input type="text" class="mm-newpt" placeholder="${__("add a point — Enter saves")}" data-n="${esc(m.name)}">
				</div>
				${m.note ? `<div class="mm-note">${esc(m.note)}</div>` : ""}
				<div class="mm-actions">
					${m.status === "Open"
						? `<button class="btn btn-xs btn-default mm-close" data-n="${esc(m.name)}" style="color:#1d7a33;">${__("Close meeting")}</button>`
						: `<button class="btn btn-xs btn-default mm-reopen" data-n="${esc(m.name)}">${__("Reopen")}</button>`}
				</div>
			</div>`).join("")
			: `<div class="mm-none">${S.q || S.status ? __("Nothing matches.") : __("No meetings yet — create the first one.")}</div>`);
		// manual toggles survive repaints; everything else stays at its default
		fuState.forEach((open, p) => root.find(`.mm-fu[data-p="${p}"]`).toggleClass("open", open));
	}

	// ---- the new-meeting form: one input per point, date prefilled to NOW ----
	function nowLocal() {
		const d = new Date();
		d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
		return d.toISOString().slice(0, 16);
	}
	function addPointRow(focus) {
		const $r = $(`<div class="mm-pt-row"><textarea rows="1" placeholder="${__("one point — one thing to do")}"></textarea><input type="text" class="mm-pt-who" placeholder="${__("@ who")}" title="${__("assign this point to someone (optional, free text)")}"><span class="x" title="${__("remove")}">&times;</span></div>`);
		root.find(".mm-pts-rows").append($r);
		if (focus) $r.find("textarea").focus();
		return $r;
	}
	// the box grows with the text — a long point stays fully readable
	root.on("input", ".mm-pt-row textarea", function () {
		this.style.height = "auto";
		this.style.height = this.scrollHeight + 2 + "px";
	});
	function resetForm() {
		root.find(".mm-note-in").val("");
		root.find(".mm-title").val(__("Daily meet")); // the usual case — overtype when it isn't
		root.find(".mm-when").val(nowLocal());
		root.find(".mm-pts-rows").empty();
		addPointRow();
	}
	root.on("click", ".mm-addrow", () => addPointRow(true));
	root.on("click", ".mm-pt-row .x", function () {
		$(this).closest(".mm-pt-row").remove();
		if (!root.find(".mm-pt-row").length) addPointRow();
	});
	// Enter in a point box opens the next box — keeps one thought per line
	root.on("keydown", ".mm-pt-row textarea", function (e) {
		if (e.key !== "Enter" || e.shiftKey) return; // Shift+Enter = a new line INSIDE the point
		e.preventDefault();
		const $rows = root.find(".mm-pt-row");
		if ($rows.last().find("textarea").get(0) === this && this.value.trim()) addPointRow(true);
		else $rows.eq($rows.index($(this).closest(".mm-pt-row")) + 1).find("textarea").focus();
	});
	resetForm();

	let busy = false;
	root.on("click", ".mm-submit", () => {
		if (busy) return;
		const title = (root.find(".mm-title").val() || "").trim();
		const when = root.find(".mm-when").val();
		if (!title) return frappe.show_alert({ message: __("Give the meeting a title."), indicator: "orange" }, 3);
		if (!when) return frappe.show_alert({ message: __("Pick the date & time."), indicator: "orange" }, 3);
		const points = root.find(".mm-pt-row").map(function () {
			return { point: ($(this).find("textarea").val() || "").trim(),
				assigned_to: ($(this).find(".mm-pt-who").val() || "").trim() };
		}).get().filter((p) => p.point);
		busy = true;
		frappe.call({ method: API + ".meeting_create", args: {
			title, meeting_on: when.replace("T", " "), points: JSON.stringify(points),
			note: root.find(".mm-note-in").val() || null,
		} }).then((r) => {
			busy = false;
			frappe.show_alert({ message: __("{0} created with {1} point(s).", [r.message.name, points.length]), indicator: "green" }, 5);
			resetForm();
			load();
		}).catch(() => { busy = false; });
	});
	root.on("click", ".mm-tile", function () { S.status = $(this).data("s"); load(); });
	root.find(".mm-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; load(); }, 300));
	// status pill cycles Open → In Process → Closed → Open
	const NEXT = { "Open": "In Process", "In Process": "Closed", "Closed": "Open" };
	const fuState = new Map(); // manual open/close overrides (default: open unless the point is Closed)
	root.on("click", ".mm-st", function () {
		const p = $(this).data("p"), next = NEXT[$(this).data("s")] || "Open";
		frappe.call({ method: API + ".meeting_set_point", args: { point: p, status: next } }).then(load);
	});
	root.on("click", ".mm-asg", function () {
		const p = $(this).data("p"), cur = $(this).data("a") || "";
		frappe.prompt(
			{ fieldname: "who", fieldtype: "Data", label: __("Assigned to (free text)"), default: cur },
			(v) => frappe.call({ method: API + ".meeting_assign_point", args: { point: p, assigned_to: v.who || "" } }).then(load),
			__("Assign this point"), __("Save"));
	});
	root.on("click", ".mm-fu-t", function () {
		const p = $(this).data("p");
		const $fu = root.find(`.mm-fu[data-p="${p}"]`);
		const nowOpen = !$fu.hasClass("open");
		fuState.set(p, nowOpen);
		$fu.toggleClass("open", nowOpen);
		if (nowOpen) $fu.find(".mm-fu-in").focus();
	});
	root.on("keydown", ".mm-fu-in", function (e) {
		if (e.key !== "Enter") return;
		const v = (this.value || "").trim();
		if (!v) return;
		frappe.call({ method: API + ".meeting_followup_add", args: { point: $(this).data("p"), note: v } }).then(load);
	});
	root.on("keydown", ".mm-newpt", function (e) {
		if (e.key !== "Enter") return;
		const v = (this.value || "").trim();
		if (!v) return;
		frappe.call({ method: API + ".meeting_add_point", args: { name: $(this).data("n"), point: v } }).then(load);
	});
	root.on("click", ".mm-pt .rm", function () {
		const p = $(this).data("p");
		frappe.confirm(__("Remove this point?"), () =>
			frappe.call({ method: API + ".meeting_remove_point", args: { point: p } }).then(load));
	});
	root.on("click", ".mm-close", function () {
		frappe.call({ method: API + ".meeting_set_status", args: { name: $(this).data("n"), status: "Closed" } }).then(load);
	});
	root.on("click", ".mm-reopen", function () {
		frappe.call({ method: API + ".meeting_set_status", args: { name: $(this).data("n"), status: "Open" } }).then(load);
	});

	frappe.pages["meeting-minutes"].on_page_show = load;
	load();
};

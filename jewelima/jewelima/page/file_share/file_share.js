// File Share — a shared drop for working files (excels, PDFs, anything).
// Anyone with the page uploads and downloads; a file is deleted only by the
// person who uploaded it, or an admin. Files stay private on the server — the
// Download button goes through the role-checked API, never a raw file URL.
frappe.pages["file-share"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("File Share"), single_column: true });
	const API = "jewelima.jewelima.api";
	const esc = frappe.utils.escape_html;
	const S = { rows: [], q: "" };

	$(page.main).append(`
		<style>
		#page-file-share .container{max-width:100%;}
		.fs-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
		.fs-q{width:260px;border:1px solid var(--border-color);border-radius:8px;height:32px;
			padding:2px 12px;background:var(--fg-color);color:var(--text-color);font-size:13px;}
		.fs-count{color:var(--text-muted);font-size:12px;}
		.fs-drop{border:2px dashed var(--border-color);border-radius:14px;padding:22px;text-align:center;
			color:var(--text-muted);font-size:13px;margin-bottom:14px;cursor:pointer;transition:border-color .1s;}
		.fs-drop:hover,.fs-drop.hot{border-color:#1f618d;color:#1f618d;background:var(--control-bg);}
		.fs-box{border:1px solid var(--border-color);border-radius:12px;overflow:auto;background:var(--fg-color);}
		table.fs-t{width:100%;border-collapse:collapse;font-size:13px;}
		table.fs-t th{position:sticky;top:0;background:var(--control-bg);font-size:10px;text-transform:uppercase;
			color:var(--text-muted);padding:7px 12px;text-align:left;border-bottom:2px solid var(--border-color);white-space:nowrap;}
		table.fs-t td{padding:6px 12px;border-bottom:1px solid var(--border-color);}
		.fs-name{font-weight:700;}
		.fs-ext{display:inline-block;border-radius:6px;padding:0 7px;font-size:10px;font-weight:800;
			margin-right:8px;background:var(--control-bg);border:1px solid var(--border-color);color:var(--text-muted);}
		.fs-none{padding:40px;text-align:center;color:var(--text-muted);}
		</style>
		<div class="fs-drop">${__("Drop files here — or click to pick (excel, PDF, anything)")}</div>
		<input type="file" class="fs-file" multiple style="display:none;">
		<div class="fs-top">
			<input type="text" class="fs-q" placeholder="${__("search a file or a person…")}">
			<span class="fs-count"></span>
		</div>
		<div class="fs-box"><table class="fs-t"><thead><tr>
			<th>${__("File")}</th><th>${__("Size")}</th><th>${__("Uploaded by")}</th><th>${__("When")}</th>
			<th style="width:150px;"></th>
		</tr></thead><tbody class="fs-body"></tbody></table></div>`);
	const root = $(page.main);

	const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB"
		: b >= 1024 ? Math.round(b / 1024) + " KB" : (b || 0) + " B");

	function paint() {
		const q = S.q.trim().toLowerCase();
		const rows = S.rows.filter((r) => !q || (r.file_name + " " + r.who).toLowerCase().includes(q));
		root.find(".fs-count").text(__("{0} file(s)", [rows.length]));
		root.find(".fs-body").html(rows.map((r) => {
			const ext = (r.file_name.split(".").pop() || "").toUpperCase().slice(0, 5);
			return `<tr>
				<td class="fs-name"><span class="fs-ext">${esc(ext)}</span>${esc(r.file_name)}</td>
				<td>${fmtSize(r.size)}</td>
				<td>${esc(r.who)}</td>
				<td title="${esc(r.when)}">${frappe.datetime.comment_when(r.when)}</td>
				<td style="text-align:right;">
					<button class="btn btn-xs btn-default fs-dl" data-n="${esc(r.name)}">${__("Download")}</button>
					${r.can_delete ? `<button class="btn btn-xs btn-default fs-rm" data-n="${esc(r.name)}"
						data-f="${esc(r.file_name)}" style="color:#b02a2a;">${__("Delete")}</button>` : ""}
				</td></tr>`;
		}).join("") || `<tr><td colspan="5" class="fs-none">${__("Nothing shared yet — drop the first file above.")}</td></tr>`);
	}
	function load() {
		frappe.call({ method: API + ".file_share_list", freeze: false }).then((r) => {
			S.rows = (r.message || {}).rows || [];
			paint();
		});
	}

	// ---- upload: click or drop; each file goes up as its own request ----------
	function upload(files) {
		const list = [...files];
		if (!list.length) return;
		const next = (i) => {
			if (i >= list.length) {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("{0} file(s) shared.", [list.length]), indicator: "green" }, 4);
				load();
				return;
			}
			frappe.dom.freeze(__("Uploading {0} of {1} — {2}…", [i + 1, list.length, list[i].name]));
			const fd = new FormData();
			fd.append("file", list[i]);
			fetch("/api/method/" + API + ".file_share_upload", {
				method: "POST", body: fd,
				headers: { "X-Frappe-CSRF-Token": frappe.csrf_token },
			}).then((res) => res.json().then((j) => {
				if (!res.ok) throw new Error((j._server_messages && JSON.parse(JSON.parse(j._server_messages)[0]).message) || res.statusText);
				next(i + 1);
			})).catch((e) => {
				frappe.dom.unfreeze();
				frappe.msgprint({ title: __("Upload failed"), indicator: "red",
					message: __("{0}: {1}", [esc(list[i].name), esc(e.message || e)]) });
				load();
			});
		};
		next(0);
	}
	root.find(".fs-drop").on("click", () => root.find(".fs-file").trigger("click"));
	root.find(".fs-file").on("change", function () { upload(this.files); this.value = ""; });
	root.find(".fs-drop")
		.on("dragover", function (e) { e.preventDefault(); this.classList.add("hot"); })
		.on("dragleave drop", function (e) { e.preventDefault(); this.classList.remove("hot"); })
		.on("drop", (e) => upload(e.originalEvent.dataTransfer.files));

	root.find(".fs-q").on("input", frappe.utils.debounce(function () { S.q = this.value || ""; paint(); }, 200));
	root.on("click", ".fs-dl", function () {
		window.open("/api/method/" + API + ".file_share_download?name=" + encodeURIComponent($(this).data("n")), "_blank");
	});
	root.on("click", ".fs-rm", function () {
		const n = $(this).data("n"), f = $(this).data("f");
		frappe.confirm(__("Delete <b>{0}</b> from the share?", [esc(f)]), () =>
			frappe.call({ method: API + ".file_share_delete", args: { name: n } }).then(() => {
				frappe.show_alert({ message: __("{0} deleted.", [esc(f)]), indicator: "orange" }, 4);
				load();
			}));
	});

	frappe.pages["file-share"].on_page_show = load;
	load();
};

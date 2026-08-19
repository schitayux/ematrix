frappe.pages["eisenhower"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Eisenhower Matrix",
		single_column: true,
	});
	wrapper.eisenhower_board = new EisenhowerBoard(page, wrapper);
};

frappe.pages["eisenhower"].on_page_show = function (wrapper) {
	if (wrapper.eisenhower_board) wrapper.eisenhower_board.refresh();
};

class EisenhowerBoard {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		this.$body = $(page.body);
		this.view = localStorage.getItem("eisenhower_matrix:view") || "cuadrante";
		this.search = "";
		this.status_filter = "activas";
		this.date_filter = "";
		this.specific_date_filter = "";
		this.overdue_only = false;
		this.type_filter = { todas: true, individuales: false, compartidas: false, delegadas: false };
		this.calendar_month = new Date();
		this.activities = [];
		this.settings = null;
		this._newly_created = null;

		this._inject_styles();
		this._render_shell();
		this._bind_events();
		this._bind_realtime();
		this.refresh();
	}

	// ---------------------------------------------------------------- styles
	_inject_styles() {
		if (document.getElementById("eisenhower-matrix-styles")) return;
		const css = `
			.em-wrapper { --em-q1: #e03131; --em-q2: #2f9e44; --em-q3: #f08c00; --em-q4: #868e96;
				--em-bg: var(--fg-color, #fff); --em-border: var(--border-color, #d1d8dd); }
			.em-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
			.em-brand { font-weight: 600; font-size: 15px; color: var(--text-muted); margin-right: 8px; }
			.em-brand b { color: var(--text-color); }
			.em-views { display: flex; gap: 4px; background: var(--control-bg); padding: 3px; border-radius: 8px; }
			.em-view-btn { border: none; background: transparent; padding: 5px 12px; border-radius: 6px;
				font-size: 12px; font-weight: 500; cursor: pointer; color: var(--text-muted); }
			.em-view-btn.active { background: var(--em-bg); color: var(--text-color); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
			.em-spacer { flex: 1; }
			.em-search { border: 1px solid var(--em-border); border-radius: 6px; padding: 5px 10px; font-size: 12px; min-width: 180px; }
			.em-bell { position: relative; cursor: pointer; border: 1px solid var(--em-border); border-radius: 6px;
				padding: 5px 10px; font-size: 12px; background: var(--em-bg); }
			.em-bell .em-badge { position: absolute; top: -6px; right: -6px; background: var(--em-q1); color: #fff;
				font-size: 10px; border-radius: 10px; padding: 1px 5px; }
			.em-filters-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
			.em-filters-row select { border: 1px solid var(--em-border); border-radius: 6px; padding: 5px 8px; font-size: 12px;
				background: var(--em-bg); color: var(--text-color); }
			.em-clear-filters { border: 1px solid var(--em-border); border-radius: 6px; padding: 5px 10px; font-size: 12px;
				background: var(--em-bg); cursor: pointer; color: var(--text-muted); }
			.em-clear-filters:hover { color: var(--text-color); }
			.em-overdue-toggle { display: flex; align-items: center; gap: 5px; border: 1px solid var(--em-border);
				border-radius: 6px; padding: 5px 10px; font-size: 12px; color: var(--text-muted); cursor: pointer;
				background: var(--em-bg); user-select: none; }
			.em-overdue-toggle.em-active { border-color: var(--em-q1); background: #fff0f0; color: #9c1c1c; font-weight: 600; }
			.em-type-filters { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted); }
			.em-type-filters label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
			.em-quadrants { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px;
				min-height: 560px; }
			.em-quadrant { border-radius: 10px; padding: 10px; background: var(--control-bg); border: 1px dashed var(--em-border);
				display: flex; flex-direction: column; min-height: 260px; }
			.em-quadrant.em-dragover { border-color: var(--text-color); background: var(--gray-100, #f4f5f6); }
			.em-quadrant-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
			.em-quadrant-title { font-weight: 600; font-size: 13px; }
			.em-quadrant-subtitle { font-size: 10px; text-transform: uppercase; letter-spacing: .02em; color: var(--text-muted); }
			.em-quadrant-help { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
				border-radius: 50%; border: 1px solid var(--em-border); color: var(--text-muted); font-size: 10px;
				font-style: italic; font-weight: 700; font-family: Georgia, serif; cursor: pointer; margin-left: 4px;
				flex-shrink: 0; }
			.em-quadrant-help:hover { background: var(--control-bg); color: var(--text-color); }
			.em-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-top: 4px; flex-shrink: 0; }
			.em-quadrant-cards { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
			.em-kanban { display: flex; gap: 12px; overflow-x: auto; min-height: 560px; }
			.em-kanban-col { min-width: 260px; flex: 1; background: var(--control-bg); border-radius: 10px; padding: 10px;
				border: 1px dashed var(--em-border); display: flex; flex-direction: column; }
			.em-kanban-col.em-dragover { border-color: var(--text-color); background: var(--gray-100, #f4f5f6); }
			.em-kanban-head { font-weight: 600; font-size: 13px; margin-bottom: 8px; }
			.em-kanban-cards { flex: 1; display: flex; flex-direction: column; gap: 8px; }
			.em-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
			.em-calendar { display: flex; flex-direction: column; gap: 8px; }
			.em-cal-header { display: flex; align-items: center; gap: 10px; }
			.em-cal-title { font-weight: 600; font-size: 14px; min-width: 140px; text-align: center; }
			.em-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
			.em-cal-weekday { text-align: center; font-size: 11px; font-weight: 600; color: var(--text-muted);
				text-transform: uppercase; padding-bottom: 2px; }
			.em-cal-cell { min-height: 92px; border: 1px solid var(--em-border); border-radius: 8px; padding: 6px;
				background: var(--control-bg); display: flex; flex-direction: column; gap: 4px; }
			.em-cal-cell.em-cal-empty { background: transparent; border-color: transparent; }
			.em-cal-cell.em-cal-today { border-color: var(--em-q1); }
			.em-cal-daynum { font-size: 11px; font-weight: 600; color: var(--text-muted); }
			.em-cal-today .em-cal-daynum { color: var(--em-q1); }
			.em-cal-items { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
			.em-cal-item { font-size: 11px; background: var(--em-bg); border-left: 3px solid var(--em-q4);
				border-radius: 3px; padding: 2px 5px; cursor: pointer; white-space: nowrap; overflow: hidden;
				text-overflow: ellipsis; }
			.em-cal-item:hover { box-shadow: 0 1px 3px rgba(0,0,0,.12); }
			.em-cal-more { font-size: 10px; color: var(--text-muted); cursor: pointer; padding-left: 5px; }
			.em-cal-more:hover { color: var(--text-color); }
			.em-card { background: var(--em-bg); border: 1px solid var(--em-border); border-left: 4px solid var(--em-q4);
				border-radius: 8px; padding: 8px 10px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
			.em-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,.10); }
			.em-card.em-dragging { opacity: .4; }
			@keyframes em-flash-new { 0%, 100% { box-shadow: 0 0 0 0 rgba(94,100,255,0); } 50% { box-shadow: 0 0 0 4px rgba(94,100,255,.55); } }
			.em-card.em-flash-new { animation: em-flash-new .5s ease-in-out 8; }
			.em-card-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
			.em-card-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
			.em-badge-pill { border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: 600; }
			.em-badge-pending { background: #fff3bf; color: #7a5c00; }
			.em-badge-accepted { background: #d3f9d8; color: #1b6b2b; }
			.em-badge-rejected { background: #ffe3e3; color: #9c1c1c; }
			.em-avatars { display: flex; }
			.em-avatar { width: 20px; height: 20px; border-radius: 50%; background: var(--dark-bg, #5e64ff); color: #fff;
				font-size: 9px; display: flex; align-items: center; justify-content: center; margin-left: -6px;
				border: 1.5px solid var(--em-bg); font-weight: 600; }
			.em-list-table { width: 100%; border-collapse: collapse; font-size: 12px; }
			.em-list-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--em-border); color: var(--text-muted); }
			.em-list-table td { padding: 7px 8px; border-bottom: 1px solid var(--em-border); vertical-align: middle; }
			.em-list-table tr:hover { background: var(--control-bg); cursor: pointer; }
			.em-empty { text-align: center; color: var(--text-muted); padding: 30px; font-size: 12px; }
			.em-invite-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
			.em-participant-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--em-border); font-size: 12px; }
			.em-participant-row .em-p-name { flex: 1; }
			.em-comment { padding: 6px 0; border-bottom: 1px solid var(--em-border); font-size: 12px; }
			.em-comment .em-c-meta { color: var(--text-muted); font-size: 10px; margin-bottom: 2px; }
			.em-comment-box { display: flex; gap: 6px; margin-top: 8px; }
			.em-comment-box textarea { flex: 1; font-size: 12px; }
			.em-invitations-list .em-inv-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--em-border); }
			.em-invitations-list .em-inv-item:last-child { border-bottom: none; }
			.em-inv-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em;
				color: var(--text-muted); margin: 16px 0 6px; }
			.em-inv-section-title:first-child { margin-top: 0; }
			.em-trash-zone { position: fixed; bottom: 24px; right: 24px; width: 58px; height: 58px; border-radius: 50%;
				background: var(--em-bg); border: 2px dashed var(--em-border); display: none; align-items: center;
				justify-content: center; font-size: 24px; z-index: 999; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
			.em-trash-zone.em-visible { display: flex; }
			.em-trash-zone.em-dragover { background: var(--em-q1); border-color: var(--em-q1); border-style: solid; transform: scale(1.12); }
			.em-invite-row { flex-wrap: wrap; }
			.em-invite-row .em-invite-type { max-width: 200px; }
			.em-invite-user-picker, .em-invite-email { min-width: 220px; }
			.em-invite-user-picker .form-control, .em-invite-email.form-control { height: 30px; font-size: 12px; }
			.em-specific-date-filter .form-control { height: 30px; font-size: 12px; max-width: 150px; }
			.em-p-remove { cursor: pointer; color: var(--text-muted); font-weight: 700; padding: 0 4px; }
			.em-p-remove:hover { color: var(--em-q1); }
			.em-badge-external { background: #e7e9ff; color: #3b3fa0; }
			.em-overdue-date { color: #f08c00; font-weight: 600; }
			.em-badge-type { background: var(--control-bg); border: 1px solid var(--em-border); color: var(--text-muted); }
			.em-dialog-tabs { display: flex; gap: 4px; background: var(--control-bg); padding: 3px;
				border-radius: 8px; margin-bottom: 14px; }
			.em-dialog-tab-btn { flex: 1; border: none; background: transparent; padding: 7px 10px;
				border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; color: var(--text-muted); }
			.em-dialog-tab-btn.active { background: var(--em-bg); color: var(--text-color);
				box-shadow: 0 1px 2px rgba(0,0,0,.08); }
			.em-activity-dialog .ql-editor { min-height: 80px; }
		`;
		$("<style>").attr("id", "eisenhower-matrix-styles").html(css).appendTo("head");
	}

	// ---------------------------------------------------------------- shell
	_render_shell() {
		this.$body.addClass("em-wrapper").html(`
			<div class="em-header">
				<span class="em-brand"><b>Eisenhower</b> Matrix · by Chappsa</span>
				<div class="em-views">
					<button class="em-view-btn" data-view="cuadrante">Cuadrante</button>
					<button class="em-view-btn" data-view="kanban">Kanban</button>
					<button class="em-view-btn" data-view="lista">Lista</button>
					<button class="em-view-btn" data-view="tarjetas">Tarjetas</button>
					<button class="em-view-btn" data-view="calendario">Calendario</button>
				</div>
				<div class="em-spacer"></div>
				<div class="em-bell" title="Invitaciones pendientes">
					🔔 Invitaciones <span class="em-badge" style="display:none">0</span>
				</div>
			</div>
			<div class="em-filters-row">
				<input type="text" class="em-search" placeholder="Buscar actividad...">
				<select class="em-status-filter">
					<option value="activas">Activas (Abierta + En Progreso)</option>
					<option value="">Todos los estados</option>
					<option value="Abierta">Abierta</option>
					<option value="En Progreso">En Progreso</option>
					<option value="Completada">Completada</option>
					<option value="Cancelada">Cancelada</option>
				</select>
				<select class="em-date-filter">
					<option value="">Todas las fechas</option>
					<option value="hoy">Hoy</option>
					<option value="hoy_vencidas">Hoy + Vencidas</option>
					<option value="programadas">Programadas (a futuro)</option>
					<option value="vencidas">Vencidas</option>
					<option value="sin_fecha">Sin fecha límite</option>
				</select>
				<span class="em-specific-date-filter" title="${__("Filtrar por una fecha específica")}"></span>
				<button class="em-clear-filters">✕ Limpiar filtros</button>
				<label class="em-overdue-toggle">
					<input type="checkbox" class="em-overdue-filter"> ⚠ Solo atrasadas
				</label>
				<div class="em-spacer"></div>
				<div class="em-type-filters">
					<label><input type="checkbox" class="em-type-cb" data-type="todas" checked> Todas</label>
					<label><input type="checkbox" class="em-type-cb" data-type="individuales"> Individuales (mías)</label>
					<label><input type="checkbox" class="em-type-cb" data-type="compartidas"> Compartidas</label>
					<label><input type="checkbox" class="em-type-cb" data-type="delegadas"> Delegadas</label>
				</div>
			</div>
			<div class="em-board-body"></div>
			<div class="em-trash-zone" title="Soltar aquí para eliminar">🗑️</div>
		`);
		this.page.set_primary_action(__("Nueva actividad"), () => this.open_activity_dialog(), "add");

		this.specific_date_control = frappe.ui.form.make_control({
			parent: this.$body.find(".em-specific-date-filter")[0],
			df: {
				fieldtype: "Date",
				fieldname: "specific_date_filter",
				placeholder: __("Fecha específica..."),
				onchange: () => {
					this.specific_date_filter = this.specific_date_control.get_value();
					if (this.specific_date_filter) this.date_filter = "";
					this._sync_filter_controls();
					this.render_view();
				},
			},
			only_input: true,
			render_input: true,
		});
		this.specific_date_control.refresh();
	}

	_bind_events() {
		this.$body.on("click", ".em-view-btn", (e) => {
			this.view = $(e.currentTarget).attr("data-view");
			localStorage.setItem("eisenhower_matrix:view", this.view);
			this.render_view();
		});
		this.$body.on(
			"input",
			".em-search",
			frappe.utils.debounce((e) => {
				this.search = e.target.value.toLowerCase();
				this.render_view();
			}, 250)
		);
		this.$body.on("change", ".em-status-filter", (e) => {
			this.status_filter = e.target.value;
			this.render_view();
		});
		this.$body.on("change", ".em-date-filter", (e) => {
			this.date_filter = e.target.value;
			if (this.date_filter) {
				this.specific_date_filter = "";
				this.specific_date_control.set_value("");
			}
			this.render_view();
		});
		this.$body.on("change", ".em-overdue-filter", (e) => {
			this.overdue_only = e.target.checked;
			this._sync_filter_controls();
			this.render_view();
		});
		this.$body.on("click", ".em-clear-filters", () => {
			this.search = "";
			this.status_filter = "activas";
			this.date_filter = "";
			this.specific_date_filter = "";
			this.specific_date_control.set_value("");
			this.overdue_only = false;
			this.type_filter = { todas: true, individuales: false, compartidas: false, delegadas: false };
			this._sync_filter_controls();
			this.render_view();
		});
		this.$body.on("change", ".em-type-cb", (e) => {
			const type = $(e.currentTarget).attr("data-type");
			if (type === "todas") {
				this.type_filter = { todas: true, individuales: false, compartidas: false, delegadas: false };
			} else {
				this.type_filter.todas = false;
				this.type_filter[type] = e.target.checked;
				if (!this.type_filter.individuales && !this.type_filter.compartidas && !this.type_filter.delegadas) {
					this.type_filter.todas = true;
				}
			}
			this._sync_filter_controls();
			this.render_view();
		});
		this.$body.on("click", ".em-bell", () => this.open_invitations_dialog());
		this.$body.on("click", "[data-open-activity]", (e) => {
			this.open_activity_dialog($(e.currentTarget).attr("data-open-activity"));
		});

		this.$body.on("dblclick", ".em-quadrant", (e) => {
			if ($(e.target).closest(".em-card, .em-quadrant-help").length) return;
			const $q = $(e.currentTarget);
			this.open_activity_dialog(null, {
				is_important: $q.attr("data-important") === "1" ? 1 : 0,
				is_urgent: $q.attr("data-urgent") === "1" ? 1 : 0,
			});
		});
		this.$body.on("click", ".em-quadrant-help", (e) => {
			e.stopPropagation();
			const $help = $(e.currentTarget);
			frappe.msgprint({
				title: $help.attr("data-quadrant-label"),
				message: $help.attr("data-help-text"),
				indicator: "blue",
			});
		});

		this.$body.on("dragover", ".em-trash-zone", (e) => {
			e.preventDefault();
			$(e.currentTarget).addClass("em-dragover");
		});
		this.$body.on("dragleave", ".em-trash-zone", (e) => {
			$(e.currentTarget).removeClass("em-dragover");
		});
		this.$body.on("drop", ".em-trash-zone", (e) => {
			e.preventDefault();
			$(e.currentTarget).removeClass("em-dragover").removeClass("em-visible");
			const name = e.originalEvent.dataTransfer.getData("text/plain");
			if (!name) return;
			this.confirm_delete_activity(name);
		});
	}

	confirm_delete_activity(name) {
		const activity = this.activities.find((a) => a.name === name);
		const title = activity ? activity.title : name;
		const also_google = activity && activity.google_event_id;
		frappe.confirm(
			also_google
				? __('¿Eliminar la actividad "{0}"? También se borrará su evento en Google Calendar. Esta acción no se puede deshacer.', [title])
				: __('¿Eliminar la actividad "{0}"? Esta acción no se puede deshacer.', [title]),
			() => {
				this._call("eisenhower_matrix.api.activity.delete_activity", { name }).then(() => this.refresh());
			}
		);
	}

	_sync_filter_controls() {
		this.$body.find(".em-search").val(this.search);
		this.$body.find(".em-status-filter").val(this.status_filter);
		this.$body.find(".em-date-filter").val(this.date_filter);
		this.$body.find(".em-overdue-filter").prop("checked", this.overdue_only);
		this.$body.find(".em-overdue-toggle").toggleClass("em-active", this.overdue_only);
		this.$body.find(".em-type-cb").each((_, el) => {
			el.checked = !!this.type_filter[$(el).attr("data-type")];
		});
	}

	_bind_realtime() {
		frappe.realtime.on("eisenhower_activity_update", () => {
			if (!this.settings || this.settings.enable_realtime) this.refresh();
		});
	}

	// ---------------------------------------------------------------- data
	refresh() {
		return Promise.all([
			this.settings ? Promise.resolve() : this._call("eisenhower_matrix.api.activity.get_settings").then((r) => (this.settings = r)),
			this._call("eisenhower_matrix.api.activity.get_board_data").then((r) => (this.activities = r || [])),
		]).then(() => this.render_view());
	}

	_call(method, args) {
		return frappe.call({ method, args }).then((r) => r.message);
	}

	// Briefly highlights a just-created activity's card wherever it renders (its
	// quadrant/kanban column/etc.) so the user can see where it landed.
	_flash_new_activity(name) {
		this._newly_created = name;
		setTimeout(() => {
			if (this._newly_created === name) {
				this._newly_created = null;
				this.render_view();
			}
		}, 4100);
	}

	// Scrolls the card into view once it's rendered, in case it landed somewhere
	// below the fold (e.g. a long quadrant, or a kanban column scrolled sideways).
	_scroll_to_card(name) {
		const el = this.$body.find(`[data-open-activity="${name}"]`).get(0);
		if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	// Overdue = has a due_date in the past and isn't already Completada/Cancelada.
	// Shared with the "Solo atrasadas" filter so both use the same definition.
	is_overdue(a) {
		if (!a.due_date) return false;
		if (a.status === "Completada" || a.status === "Cancelada") return false;
		return a.due_date < frappe.datetime.get_today();
	}

	// Time fields come back from the server as "H:MM:SS" (not always zero-padded),
	// normalize to "HH:MM" for display.
	format_time(t) {
		if (!t) return "";
		const [h, m] = t.split(":");
		return `${h.padStart(2, "0")}:${m}`;
	}

	time_range_text(a) {
		if (!a.start_time) return "";
		const end = a.end_time ? ` – ${this.format_time(a.end_time)}` : "";
		return ` ${this.format_time(a.start_time)}${end}`;
	}

	visible_activities() {
		const today = frappe.datetime.get_today();
		const filtered = this.activities.filter((a) => {
			if (this.search && !a.title.toLowerCase().includes(this.search)) return false;

			if (this.status_filter === "activas") {
				if (a.status !== "Abierta" && a.status !== "En Progreso") return false;
			} else if (this.status_filter && a.status !== this.status_filter) {
				return false;
			}

			if (this.specific_date_filter) {
				if (a.due_date !== this.specific_date_filter) return false;
			} else {
				if (this.date_filter === "hoy" && a.due_date !== today) return false;
				if (this.date_filter === "hoy_vencidas" && !(a.due_date && a.due_date <= today)) return false;
				if (this.date_filter === "programadas" && !(a.due_date && a.due_date > today)) return false;
				if (this.date_filter === "vencidas" && !(a.due_date && a.due_date < today)) return false;
				if (this.date_filter === "sin_fecha" && a.due_date) return false;
			}

			if (this.overdue_only && !this.is_overdue(a)) return false;

			if (!this.type_filter.todas) {
				const is_delegada = (a.participants || []).some((p) => p.invite_role === "Delegado");
				const is_compartida = (a.participants || []).some((p) => p.invite_role === "Colaborador");
				const is_individual = !a.is_shared;
				const matches =
					(this.type_filter.individuales && is_individual) ||
					(this.type_filter.compartidas && is_compartida) ||
					(this.type_filter.delegadas && is_delegada);
				if (!matches) return false;
			}

			return true;
		});

		// Always ascending by due date (earliest/most urgent first); undated
		// activities sort last, in their original relative order.
		filtered.sort((a, b) => {
			if (!a.due_date && !b.due_date) return 0;
			if (!a.due_date) return 1;
			if (!b.due_date) return -1;
			return a.due_date.localeCompare(b.due_date);
		});
		return filtered;
	}

	pending_for_me() {
		return this.activities.filter((a) => a.my_participant_status === "Pendiente");
	}

	// Invitations I sent (as owner) that the other person hasn't answered yet.
	// "Externo" rows never go through accept/reject in this app, so they're excluded.
	sent_pending() {
		const user = frappe.session.user;
		const result = [];
		this.activities.forEach((activity) => {
			if (activity.owner !== user) return;
			(activity.participants || []).forEach((row) => {
				if (row.invite_role !== "Externo" && row.status === "Pendiente") {
					result.push({ activity, row });
				}
			});
		});
		return result;
	}

	// Invitations already answered, both directions: ones sent to me (I responded) and
	// ones I sent to others (they responded) — sorted most recent response first.
	history_items() {
		const user = frappe.session.user;
		const result = [];
		this.activities.forEach((activity) => {
			(activity.participants || []).forEach((row) => {
				if (row.invite_role === "Externo" || row.status === "Pendiente") return;
				if (row.user === user) result.push({ activity, row, direction: "received" });
				else if (activity.owner === user) result.push({ activity, row, direction: "sent" });
			});
		});
		result.sort((a, b) => (b.row.responded_on || "").localeCompare(a.row.responded_on || ""));
		return result;
	}

	// ---------------------------------------------------------------- render dispatch
	render_view() {
		this.$body.find(".em-view-btn").removeClass("active");
		this.$body.find(`.em-view-btn[data-view="${this.view}"]`).addClass("active");

		const pending = this.pending_for_me();
		const $badge = this.$body.find(".em-bell .em-badge");
		if (pending.length) $badge.text(pending.length).show();
		else $badge.hide();

		const $out = this.$body.find(".em-board-body");
		if (this.view === "kanban") $out.html(this.render_kanban());
		else if (this.view === "lista") $out.html(this.render_list());
		else if (this.view === "tarjetas") $out.html(this.render_cards());
		else if (this.view === "calendario") $out.html(this.render_calendar());
		else $out.html(this.render_quadrant());

		this._bind_drag_drop();
		this._bind_calendar_events();
	}

	quadrant_meta(key) {
		const fallback = {
			"Hazlo Ya": { label: "Hazlo Ya", color: "#e03131" },
			"Planifícalo": { label: "Planifícalo", color: "#2f9e44" },
			"Delégalo": { label: "Delégalo", color: "#f08c00" },
			"Elimínalo": { label: "Elimínalo", color: "#868e96" },
		};
		return (this.settings && this.settings.quadrants && this.settings.quadrants[key]) || fallback[key];
	}

	// ---------------------------------------------------------------- quadrant view
	render_quadrant() {
		const quads = [
			{
				key: "Hazlo Ya",
				important: 1,
				urgent: 1,
				standard: "Urgente e Importante",
				help: "Crisis y tareas con plazo inmediato: si no las atiendes hoy, hay consecuencias serias. Ejemplo: “Responder al cliente que amenaza con cancelar el contrato hoy”.",
			},
			{
				key: "Planifícalo",
				important: 1,
				urgent: 0,
				standard: "No Urgente, e Importante",
				help: "Lo que aporta valor a mediano/largo plazo pero no tiene fecha límite inminente: planificación, mejora de procesos, capacitación, relaciones. Ejemplo: “Preparar el plan de ventas del próximo trimestre”.",
			},
			{
				key: "Delégalo",
				important: 0,
				urgent: 1,
				standard: "Urgente, no Importante",
				help: "Interrupciones o solicitudes con plazo que alguien más puede resolver sin tu criterio directo. Ejemplo: “Agendar la reunión con el proveedor”.",
			},
			{
				key: "Elimínalo",
				important: 0,
				urgent: 0,
				standard: "No Urgente ni Importante",
				help: "Distracciones o tareas de bajo valor que puedes posponer, automatizar o eliminar. Ejemplo: “Revisar correos que no son prioritarios”.",
			},
		];
		const activities = this.visible_activities();
		const cells = quads
			.map((q) => {
				const meta = this.quadrant_meta(q.key);
				const items = activities.filter((a) => a.effective_quadrant === q.key);
				return `
					<div class="em-quadrant" data-important="${q.important}" data-urgent="${q.urgent}"
						title="${__("Doble clic para crear una actividad en este cuadrante")}">
						<div class="em-quadrant-head">
							<span class="em-dot" style="background:${meta.color}"></span>
							<div>
								<div class="em-quadrant-title">${frappe.utils.escape_html(meta.label)}
									<span style="color:var(--text-muted); font-weight:400;">(${items.length})</span>
									<span class="em-quadrant-help" data-quadrant-label="${frappe.utils.escape_html(meta.label)}"
										data-help-text="${frappe.utils.escape_html(q.help)}">i</span>
								</div>
								<div class="em-quadrant-subtitle">${q.standard}</div>
							</div>
						</div>
						<div class="em-quadrant-cards">
							${items.map((a) => this.card_html(a)).join("") || '<div class="em-empty">Sin actividades</div>'}
						</div>
					</div>
				`;
			})
			.join("");
		return `<div class="em-quadrants">${cells}</div>`;
	}

	// ---------------------------------------------------------------- kanban view
	render_kanban() {
		const columns = ["Abierta", "En Progreso", "Completada", "Cancelada"];
		const activities = this.visible_activities();
		const cols = columns
			.map((status) => {
				const items = activities.filter((a) => a.status === status);
				return `
					<div class="em-kanban-col" data-status="${status}">
						<div class="em-kanban-head">${status} <span style="color:var(--text-muted); font-weight:400;">(${items.length})</span></div>
						<div class="em-kanban-cards">
							${items.map((a) => this.card_html(a)).join("") || '<div class="em-empty">Sin actividades</div>'}
						</div>
					</div>
				`;
			})
			.join("");
		return `<div class="em-kanban">${cols}</div>`;
	}

	// ---------------------------------------------------------------- list view
	render_list() {
		const activities = this.visible_activities();
		if (!activities.length) return '<div class="em-empty">Sin actividades</div>';
		const rows = activities
			.map((a) => {
				const meta = this.quadrant_meta(a.effective_quadrant);
				return `
					<tr data-open-activity="${a.name}">
						<td><span class="em-dot" style="background:${meta.color}"></span> ${frappe.utils.escape_html(a.title)}</td>
						<td>${frappe.utils.escape_html(meta.label)}</td>
						<td>${a.task_type === "Personal" ? "🏠" : "💼"} ${a.task_type || "Laboral"}</td>
						<td>${a.status}</td>
						<td class="${this.is_overdue(a) ? "em-overdue-date" : ""}">${a.due_date ? frappe.datetime.str_to_user(a.due_date) : ""}${this.time_range_text(a)}</td>
						<td>${this.avatars_html(a)}</td>
						<td>${a.comment_count ? `💬 ${a.comment_count}` : ""}</td>
					</tr>
				`;
			})
			.join("");
		return `
			<table class="em-list-table">
				<thead><tr><th>Título</th><th>Cuadrante</th><th>Tipo</th><th>Estado</th><th>Fecha límite</th><th>Participantes</th><th></th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	}

	// ---------------------------------------------------------------- cards view
	render_cards() {
		const activities = this.visible_activities();
		if (!activities.length) return '<div class="em-empty">Sin actividades</div>';
		return `<div class="em-cards-grid">${activities.map((a) => this.card_html(a)).join("")}</div>`;
	}

	// ---------------------------------------------------------------- calendar view
	static MONTH_NAMES = [
		"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
		"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
	];
	static WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

	render_calendar() {
		const by_date = {};
		this.visible_activities().forEach((a) => {
			if (!a.due_date) return;
			(by_date[a.due_date] = by_date[a.due_date] || []).push(a);
		});

		const year = this.calendar_month.getFullYear();
		const month = this.calendar_month.getMonth();
		const first_weekday = new Date(year, month, 1).getDay();
		const days_in_month = new Date(year, month + 1, 0).getDate();
		const today_str = frappe.datetime.get_today();

		let cells = "";
		for (let i = 0; i < first_weekday; i++) cells += '<div class="em-cal-cell em-cal-empty"></div>';
		for (let day = 1; day <= days_in_month; day++) {
			const date_str = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const items = by_date[date_str] || [];
			const shown = items.slice(0, 3);
			const extra = items.length - shown.length;
			cells += `
				<div class="em-cal-cell ${date_str === today_str ? "em-cal-today" : ""}">
					<div class="em-cal-daynum">${day}</div>
					<div class="em-cal-items">
						${shown
							.map((a) => {
								const meta = this.quadrant_meta(a.effective_quadrant);
								const overdue_cls = this.is_overdue(a) ? " em-overdue-date" : "";
								return `<div class="em-cal-item${overdue_cls}" data-open-activity="${a.name}" style="border-left-color:${meta.color}">${frappe.utils.escape_html(a.title)}</div>`;
							})
							.join("")}
						${extra > 0 ? `<div class="em-cal-more" data-date="${date_str}">+${extra} ${__("más")}</div>` : ""}
					</div>
				</div>
			`;
		}
		const trailing = (7 - ((first_weekday + days_in_month) % 7)) % 7;
		for (let i = 0; i < trailing; i++) cells += '<div class="em-cal-cell em-cal-empty"></div>';

		return `
			<div class="em-calendar">
				<div class="em-cal-header">
					<button class="btn btn-xs btn-default em-cal-prev">‹</button>
					<span class="em-cal-title">${EisenhowerBoard.MONTH_NAMES[month]} ${year}</span>
					<button class="btn btn-xs btn-default em-cal-next">›</button>
					<button class="btn btn-xs btn-default em-cal-today-btn">${__("Hoy")}</button>
				</div>
				<div class="em-cal-grid em-cal-weekdays">
					${EisenhowerBoard.WEEKDAY_NAMES.map((w) => `<div class="em-cal-weekday">${w}</div>`).join("")}
				</div>
				<div class="em-cal-grid">${cells}</div>
			</div>
		`;
	}

	_bind_calendar_events() {
		this.$body.find(".em-cal-prev").on("click", () => {
			this.calendar_month.setMonth(this.calendar_month.getMonth() - 1);
			this.render_view();
		});
		this.$body.find(".em-cal-next").on("click", () => {
			this.calendar_month.setMonth(this.calendar_month.getMonth() + 1);
			this.render_view();
		});
		this.$body.find(".em-cal-today-btn").on("click", () => {
			this.calendar_month = new Date();
			this.render_view();
		});
		this.$body.find(".em-cal-more").on("click", (e) => {
			this.open_day_dialog($(e.currentTarget).attr("data-date"));
		});
	}

	open_day_dialog(date_str) {
		const items = this.visible_activities().filter((a) => a.due_date === date_str);
		const d = new frappe.ui.Dialog({
			title: frappe.datetime.str_to_user(date_str),
			fields: [{ fieldname: "list_html", fieldtype: "HTML" }],
		});
		const $wrap = d.fields_dict.list_html.$wrapper;
		$wrap.html(
			items.length
				? `<div class="em-cards-grid">${items.map((a) => this.card_html(a)).join("")}</div>`
				: `<div class="em-empty">${__("Sin actividades")}</div>`
		);
		$wrap.on("click", "[data-open-activity]", (e) => {
			const name = $(e.currentTarget).attr("data-open-activity");
			d.hide();
			this.open_activity_dialog(name);
		});
		d.show();
	}

	// ---------------------------------------------------------------- shared card
	// "Compartida" = has at least one internal team member (Colaborador); "Invitados"
	// = has at least one external email invite; an activity with both shows both.
	share_badges_html(a) {
		const participants = a.participants || [];
		const has_team = participants.some((p) => p.invite_role === "Colaborador");
		const has_external = participants.some((p) => p.invite_role === "Externo");
		let html = "";
		if (has_team) html += '<span class="em-badge-pill em-badge-accepted">Compartida</span>';
		if (has_external) html += '<span class="em-badge-pill em-badge-external">Invitados</span>';
		return html;
	}

	card_html(a) {
		const meta = this.quadrant_meta(a.effective_quadrant);
		let badge = "";
		if (a.my_participant_status === "Pendiente") badge = '<span class="em-badge-pill em-badge-pending">Pendiente</span>';
		else badge = this.share_badges_html(a);
		const flash = a.name === this._newly_created ? " em-flash-new" : "";
		return `
			<div class="em-card${flash}" draggable="true" data-name="${a.name}" data-open-activity="${a.name}" style="border-left-color:${meta.color}">
				<div class="em-card-title">${frappe.utils.escape_html(a.title)}</div>
				<div class="em-card-meta">
					${a.due_date ? `<span class="${this.is_overdue(a) ? "em-overdue-date" : ""}">📅 ${frappe.datetime.str_to_user(a.due_date)}${this.time_range_text(a)}</span>` : ""}
					<span>${a.status}</span>
					<span class="em-badge-pill em-badge-type">${a.task_type === "Personal" ? "🏠" : "💼"} ${a.task_type || "Laboral"}</span>
					${badge}
					${a.comment_count ? `<span>💬 ${a.comment_count}</span>` : ""}
					${this.avatars_html(a)}
				</div>
			</div>
		`;
	}

	avatars_html(a) {
		if (!a.participants || !a.participants.length) return "";
		return `<span class="em-avatars">${a.participants
			.slice(0, 4)
			.map((p) => {
				const label = p.user || p.external_email || "?";
				const status = p.invite_role === "Externo" ? __("Externo") : p.status;
				return `<span class="em-avatar" title="${frappe.utils.escape_html(label)} · ${status}">${this.initials(label)}</span>`;
			})
			.join("")}</span>`;
	}

	initials(email) {
		if (!email) return "?";
		const name = frappe.user_info ? frappe.user_info(email).fullname || email : email;
		return name
			.split(/[\s.@_]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0].toUpperCase())
			.join("");
	}

	// ---------------------------------------------------------------- drag & drop
	_bind_drag_drop() {
		const self = this;
		this.$body.find(".em-card[draggable=true]").on("dragstart", function (e) {
			e.originalEvent.dataTransfer.setData("text/plain", $(this).attr("data-name"));
			$(this).addClass("em-dragging");
			self.$body.find(".em-trash-zone").addClass("em-visible");
		});
		this.$body.find(".em-card[draggable=true]").on("dragend", function () {
			$(this).removeClass("em-dragging");
			self.$body.find(".em-trash-zone").removeClass("em-visible").removeClass("em-dragover");
		});

		this.$body.find(".em-quadrant").on("dragover", function (e) {
			e.preventDefault();
			$(this).addClass("em-dragover");
		});
		this.$body.find(".em-quadrant").on("dragleave", function () {
			$(this).removeClass("em-dragover");
		});
		this.$body.find(".em-quadrant").on("drop", function (e) {
			e.preventDefault();
			$(this).removeClass("em-dragover");
			const name = e.originalEvent.dataTransfer.getData("text/plain");
			const important = $(this).attr("data-important") === "1";
			const urgent = $(this).attr("data-urgent") === "1";
			self.reclassify_activity(name, important, urgent);
		});

		this.$body.find(".em-kanban-col").on("dragover", function (e) {
			e.preventDefault();
			$(this).addClass("em-dragover");
		});
		this.$body.find(".em-kanban-col").on("dragleave", function () {
			$(this).removeClass("em-dragover");
		});
		this.$body.find(".em-kanban-col").on("drop", function (e) {
			e.preventDefault();
			$(this).removeClass("em-dragover");
			const name = e.originalEvent.dataTransfer.getData("text/plain");
			const status = $(this).attr("data-status");
			self._call("eisenhower_matrix.api.activity.update_activity", {
				name,
				payload: JSON.stringify({ status }),
			}).then(() => self.refresh());
		});
	}

	reclassify_activity(name, important, urgent) {
		const activity = this.activities.find((a) => a.name === name);
		if (!activity) return;
		const is_mine = activity.owner === frappe.session.user;
		const payload = is_mine
			? { is_important: important ? 1 : 0, is_urgent: urgent ? 1 : 0 }
			: {
					override_classification: 1,
					personal_important: important ? 1 : 0,
					personal_urgent: urgent ? 1 : 0,
				};
		this._call("eisenhower_matrix.api.activity.update_activity", {
			name,
			payload: JSON.stringify(payload),
		}).then(() => this.refresh());
	}

	// ---------------------------------------------------------------- invitations
	open_invitations_dialog() {
		const d = new frappe.ui.Dialog({
			title: __("Invitaciones"),
			size: "large",
			fields: [{ fieldname: "list_html", fieldtype: "HTML" }],
		});
		const $wrap = d.fields_dict.list_html.$wrapper;

		const render = () => {
			const pending = this.pending_for_me();
			const sent_pending = this.sent_pending();
			const history = this.history_items();

			const pending_html = pending.length
				? pending
						.map(
							(a) => `
					<div class="em-inv-item" data-name="${a.name}">
						<div style="flex:1"><b>${frappe.utils.escape_html(a.title)}</b><br>
							<span style="color:var(--text-muted); font-size:11px;">de ${frappe.utils.escape_html(a.owner)}</span></div>
						<button class="btn btn-xs btn-success" data-respond="Aceptada">Aceptar</button>
						<button class="btn btn-xs btn-danger" data-respond="Rechazada">Rechazar</button>
					</div>
				`
						)
						.join("")
				: `<div class="em-empty">${__("No tienes invitaciones pendientes")}</div>`;

			const sent_pending_html = sent_pending.length
				? sent_pending
						.map(
							({ activity, row }) => `
					<div class="em-inv-item">
						<div style="flex:1"><b>${frappe.utils.escape_html(activity.title)}</b><br>
							<span style="color:var(--text-muted); font-size:11px;">${__("a")} ${frappe.utils.escape_html(row.user)}</span></div>
						<span class="em-badge-pill em-badge-pending">${__("Pendiente")}</span>
					</div>
				`
						)
						.join("")
				: `<div class="em-empty">${__("No tienes invitaciones enviadas en espera")}</div>`;

			const history_html = history.length
				? history
						.map(({ activity, row, direction }) => {
							const badge_class = row.status === "Aceptada" ? "em-badge-accepted" : "em-badge-rejected";
							const who =
								direction === "received"
									? `${__("de")} ${frappe.utils.escape_html(activity.owner)}`
									: `${__("a")} ${frappe.utils.escape_html(row.user)}`;
							const when = row.responded_on ? frappe.datetime.comment_when(row.responded_on) : "";
							const can_resend = direction === "sent" && row.status === "Rechazada";
							return `
						<div class="em-inv-item" data-activity="${activity.name}" data-row="${row.name}">
							<div style="flex:1"><b>${frappe.utils.escape_html(activity.title)}</b><br>
								<span style="color:var(--text-muted); font-size:11px;">${who} · ${when}</span></div>
							<span class="em-badge-pill ${badge_class}">${row.status}</span>
							${can_resend ? `<button class="btn btn-xs btn-default em-resend-btn">${__("Reenviar")}</button>` : ""}
						</div>
					`;
						})
						.join("")
				: `<div class="em-empty">${__("Sin historial todavía")}</div>`;

			$wrap.html(`
				<div class="em-inv-section-title">${__("Pendientes de mi respuesta")}</div>
				<div class="em-invitations-list">${pending_html}</div>
				<div class="em-inv-section-title">${__("Enviadas por mí — esperando respuesta")}</div>
				<div class="em-invitations-list">${sent_pending_html}</div>
				<div class="em-inv-section-title">${__("Histórico")}</div>
				<div class="em-invitations-list">${history_html}</div>
			`);
		};
		render();

		$wrap.on("click", "[data-respond]", (e) => {
			const $item = $(e.currentTarget).closest(".em-inv-item");
			const name = $item.attr("data-name");
			const response = $(e.currentTarget).attr("data-respond");
			this._call("eisenhower_matrix.api.activity.respond_to_invitation", { activity: name, response }).then(() => {
				this.refresh().then(render);
			});
		});

		$wrap.on("click", ".em-resend-btn", (e) => {
			const $item = $(e.currentTarget).closest(".em-inv-item");
			const activity = $item.attr("data-activity");
			const row_name = $item.attr("data-row");
			this._call("eisenhower_matrix.api.activity.resend_invitation", { activity, row_name }).then(() => {
				this.refresh().then(render);
			});
		});

		d.show();
	}

	// ---------------------------------------------------------------- activity dialog
	open_activity_dialog(name, initial) {
		const activity = name ? this.activities.find((a) => a.name === name) : null;
		const init = initial || {};
		const has_google_sync = this.settings && this.settings.has_google_sync;

		// A participant who hasn't accepted (or has rejected) their invitation yet can
		// look at the activity but shouldn't be able to change it — only the owner or
		// an already-accepted participant can edit. Accepting/rejecting still happens
		// from the Participantes tab regardless of this.
		const my_row = activity ? (activity.participants || []).find((p) => p.user === frappe.session.user) : null;
		const view_only = !!(activity && my_row && my_row.status !== "Aceptada");

		const fields = [
			{ fieldname: "title", fieldtype: "Data", label: __("Título"), reqd: 1, default: activity ? activity.title : "", read_only: view_only },
			{ fieldname: "description", fieldtype: "Text Editor", label: __("Descripción"), default: activity ? activity.description : "", read_only: view_only },
			{ fieldname: "sec_clas", fieldtype: "Section Break", label: __("Clasificación") },
			{ fieldname: "is_important", fieldtype: "Check", label: __("Importante"), default: activity ? activity.is_important : init.is_important || 0, read_only: view_only },
			{ fieldname: "col_clas", fieldtype: "Column Break" },
			{ fieldname: "is_urgent", fieldtype: "Check", label: __("Urgente"), default: activity ? activity.is_urgent : init.is_urgent || 0, read_only: view_only },
			{ fieldname: "sec_seg", fieldtype: "Section Break", label: __("Seguimiento") },
			{
				fieldname: "status",
				fieldtype: "Select",
				label: __("Estado"),
				options: "Abierta\nEn Progreso\nCompletada\nCancelada",
				default: activity ? activity.status : "Abierta",
				read_only: view_only,
			},
			{
				fieldname: "task_type",
				fieldtype: "Select",
				label: __("Tipo de Tarea"),
				options: "Personal\nLaboral",
				default: activity ? activity.task_type : "Laboral",
				read_only: view_only,
			},
			{ fieldname: "col_seg", fieldtype: "Column Break" },
			{ fieldname: "due_date", fieldtype: "Date", label: __("Fecha límite"), default: activity ? activity.due_date : "", read_only: view_only },
			{
				fieldname: "start_time",
				fieldtype: "Time",
				label: __("Hora de inicio"),
				default: activity ? activity.start_time : "",
				read_only: view_only,
			},
			{
				fieldname: "end_time",
				fieldtype: "Time",
				label: __("Hora de fin"),
				default: activity ? activity.end_time : "",
				read_only: view_only,
			},
		];

		if (has_google_sync) {
			fields.push({
				fieldname: "sync_to_google",
				fieldtype: "Check",
				label: __("Sincronizar con Google Calendar"),
				default: activity && activity.sync_to_google !== undefined ? activity.sync_to_google : 1,
				read_only: view_only,
			});
		}

		fields.push(
			{ fieldname: "sec_part", fieldtype: "Section Break", label: __("Participantes") },
			{ fieldname: "participants_html", fieldtype: "HTML" },
			{ fieldname: "sec_com", fieldtype: "Section Break", label: __("Comentarios") },
			{ fieldname: "comments_html", fieldtype: "HTML" }
		);

		const dialog_opts = {
			title: activity ? (view_only ? __("Ver actividad") : __("Editar actividad")) : __("Nueva actividad"),
			size: "large",
			fields,
		};

		if (!view_only) {
			dialog_opts.primary_action_label = activity ? __("Guardar") : __("Crear");
			dialog_opts.primary_action = (values) => {
				if (d._em_submitting) return;
				d._em_submitting = true;
				d.disable_primary_action();

				const payload = {
					title: values.title,
					task_type: values.task_type,
					description: values.description,
					is_important: values.is_important ? 1 : 0,
					is_urgent: values.is_urgent ? 1 : 0,
					status: values.status,
					due_date: values.due_date,
					start_time: values.start_time || null,
					end_time: values.end_time || null,
				};
				if (has_google_sync) {
					payload.sync_to_google = values.sync_to_google ? 1 : 0;
				}
				const call = activity
					? this._call("eisenhower_matrix.api.activity.update_activity", { name: activity.name, payload: JSON.stringify(payload) })
					: this._call("eisenhower_matrix.api.activity.create_activity", { payload: JSON.stringify(payload) });
				call
					.then((result) => {
						d.hide();
						if (!activity && result) {
							this._flash_new_activity(result);
							this.refresh().then(() => this._scroll_to_card(result));
						} else {
							this.refresh();
						}
					})
					.catch(() => {
						d._em_submitting = false;
						d.enable_primary_action();
					});
			};
		}

		const d = new frappe.ui.Dialog(dialog_opts);
		d.$wrapper.addClass("em-activity-dialog");

		if (activity) {
			this._render_participants(d, activity);
			this._render_comments(d, activity);
		} else {
			d.fields_dict.participants_html.$wrapper.html(
				'<div class="em-empty">Guarda la actividad para poder compartirla o delegarla.</div>'
			);
			d.fields_dict.comments_html.$wrapper.html('<div class="em-empty">Guarda la actividad para comentar.</div>');
		}

		this._wire_dialog_tabs(d);
		d.show();
	}

	// Manual tab bar built on the plain, long-standing ".form-section" class + DOM
	// traversal (no dependency on Dialog's internal tab machinery).
	_wire_dialog_tabs(d) {
		const $sections = $(d.body).find(".form-section");
		if (!$sections.length) return;

		const participants_idx = $sections.index(d.fields_dict.participants_html.$wrapper.closest(".form-section"));
		const comments_idx = $sections.index(d.fields_dict.comments_html.$wrapper.closest(".form-section"));

		const groups = { detalle: [], participantes: [], comentarios: [] };
		$sections.each((i, el) => {
			if (i === participants_idx) groups.participantes.push(el);
			else if (i === comments_idx) groups.comentarios.push(el);
			else groups.detalle.push(el);
		});

		const tabs = [
			{ key: "detalle", label: __("Detalle") },
			{ key: "participantes", label: __("Participantes") },
			{ key: "comentarios", label: __("Comentarios") },
		];
		const $bar = $(`
			<div class="em-dialog-tabs">
				${tabs.map((t) => `<button type="button" class="em-dialog-tab-btn" data-tab="${t.key}">${t.label}</button>`).join("")}
			</div>
		`);
		$(d.body).prepend($bar);

		const show_tab = (key) => {
			Object.keys(groups).forEach((k) => $(groups[k]).toggle(k === key));
			$bar.find(".em-dialog-tab-btn").removeClass("active").filter(`[data-tab="${key}"]`).addClass("active");
		};
		$bar.on("click", ".em-dialog-tab-btn", (e) => show_tab($(e.currentTarget).attr("data-tab")));
		show_tab("detalle");
	}

	_render_participants(d, activity) {
		const $wrap = d.fields_dict.participants_html.$wrapper;
		const is_owner = activity.owner === frappe.session.user;
		const has_google_sync = this.settings && this.settings.has_google_sync;

		const rows = (activity.participants || [])
			.map((p) => {
				const is_external = p.invite_role === "Externo";
				const label = is_external ? p.external_email : p.user;
				const badge_class = is_external
					? "em-badge-external"
					: p.status === "Aceptada"
						? "em-badge-accepted"
						: p.status === "Rechazada"
							? "em-badge-rejected"
							: "em-badge-pending";
				const badge_text = is_external ? __("Externo · Google Calendar") : p.status;
				const mine = p.user === frappe.session.user && p.status === "Pendiente";
				return `
					<div class="em-participant-row" data-row="${p.name}">
						<span class="em-avatar">${this.initials(label)}</span>
						<span class="em-p-name">${frappe.utils.escape_html(label || "")}</span>
						<span class="em-badge-pill ${badge_class}">${badge_text}</span>
						${mine ? '<button class="btn btn-xs btn-success" data-respond="Aceptada">Aceptar</button><button class="btn btn-xs btn-danger" data-respond="Rechazada">Rechazar</button>' : ""}
						${is_owner ? `<span class="em-p-remove" data-remove-row="${p.name}" title="${__("Quitar")}">✕</span>` : ""}
					</div>
				`;
			})
			.join("");

		let invite_row = "";
		if (is_owner) {
			invite_row = `
				<div class="em-invite-row">
					<select class="form-control em-invite-type">
						<option value="Colaborador">${__("Colaborador (usuario del sistema)")}</option>
						${has_google_sync ? `<option value="Externo">${__("Externo (invitado por correo)")}</option>` : ""}
					</select>
					<span class="em-invite-user-picker"></span>
					<input type="email" class="form-control em-invite-email" placeholder="correo@ejemplo.com" style="display:none">
					<button class="btn btn-xs btn-primary em-stage-btn">${__("Agregar")}</button>
				</div>
			`;
		}

		$wrap.html(`${invite_row}<div>${rows || '<div class="em-empty">Sin participantes todavía</div>'}</div>`);

		if (is_owner) {
			const user_control = frappe.ui.form.make_control({
				parent: $wrap.find(".em-invite-user-picker")[0],
				df: {
					fieldtype: "Link",
					fieldname: "invite_user",
					options: "User",
					placeholder: __("Buscar usuario..."),
					filters: { user_type: "System User", enabled: 1, name: ["!=", frappe.session.user] },
				},
				only_input: true,
				render_input: true,
			});
			user_control.refresh();

			const toggle_type = () => {
				const type = $wrap.find(".em-invite-type").val();
				$wrap.find(".em-invite-user-picker").toggle(type === "Colaborador");
				$wrap.find(".em-invite-email").toggle(type === "Externo");
			};
			toggle_type();
			$wrap.find(".em-invite-type").on("change", toggle_type);

			$wrap.find(".em-stage-btn").on("click", (e) => {
				const $btn = $(e.currentTarget);
				const type = $wrap.find(".em-invite-type").val();
				let participant;
				if (type === "Externo") {
					const email = $wrap.find(".em-invite-email").val().trim();
					if (!email) return;
					participant = { invite_role: "Externo", external_email: email };
				} else {
					const user = user_control.get_value();
					if (!user) return;
					participant = { invite_role: "Colaborador", user };
				}

				$btn.prop("disabled", true);
				this._call("eisenhower_matrix.api.activity.invite_participants", {
					activity: activity.name,
					participants: JSON.stringify([participant]),
				})
					.then(() => {
						this.refresh().then(() => {
							const fresh = this.activities.find((a) => a.name === activity.name);
							this._render_participants(d, fresh);
						});
					})
					.catch(() => $btn.prop("disabled", false));
			});

			$wrap.find("[data-remove-row]").on("click", (e) => {
				const row_name = $(e.currentTarget).attr("data-remove-row");
				this._call("eisenhower_matrix.api.activity.remove_participant", {
					activity: activity.name,
					row_name,
				}).then(() => {
					this.refresh().then(() => {
						const fresh = this.activities.find((a) => a.name === activity.name);
						this._render_participants(d, fresh);
					});
				});
			});
		}

		$wrap.find("[data-respond]").on("click", (e) => {
			const response = $(e.currentTarget).attr("data-respond");
			this._call("eisenhower_matrix.api.activity.respond_to_invitation", { activity: activity.name, response }).then(() => {
				this.refresh().then(() => {
					const fresh = this.activities.find((a) => a.name === activity.name);
					if (fresh) this._render_participants(d, fresh);
				});
			});
		});
	}

	_render_comments(d, activity) {
		const $wrap = d.fields_dict.comments_html.$wrapper;
		$wrap.html('<div class="em-comments-list"><div class="em-empty">Cargando...</div></div><div class="em-comment-box">' +
			'<textarea class="form-control em-new-comment" rows="2" placeholder="Escribe un comentario..."></textarea>' +
			'<button class="btn btn-xs btn-primary em-send-comment">Enviar</button></div>');

		const load = () => {
			this._call("eisenhower_matrix.api.activity.get_comments", { activity: activity.name }).then((comments) => {
				comments = comments || [];
				const html = comments.length
					? comments
							.map(
								(c) => `
						<div class="em-comment">
							<div class="em-c-meta">${frappe.utils.escape_html(c.comment_by)} · ${frappe.datetime.comment_when(c.creation)}</div>
							<div>${c.content}</div>
						</div>
					`
							)
							.join("")
					: '<div class="em-empty">Sin comentarios todavía</div>';
				$wrap.find(".em-comments-list").html(html);
			});
		};
		load();

		$wrap.find(".em-send-comment").on("click", () => {
			const content = $wrap.find(".em-new-comment").val();
			if (!content) return;
			frappe
				.call({
					method: "frappe.desk.form.utils.add_comment",
					args: {
						reference_doctype: "EU Activity",
						reference_name: activity.name,
						content,
						comment_email: frappe.session.user,
						comment_by: frappe.session.user_fullname,
					},
				})
				.then(() => {
					$wrap.find(".em-new-comment").val("");
					load();
				});
		});
	}
}

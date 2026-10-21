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

// Google Calendar-style time picking: fixed 15-minute slots instead of the native
// Time control's fiddly hour/minute/second steppers. The day's last selectable slot
// is capped at 23:30 (not 23:45) so "start + 1h" always has a valid slot to land on —
// values still travel as plain "HH:MM" strings, which Frappe's native Time fieldtype
// stores exactly the same way it always has, so nothing changes on the storage side.
const EM_TIME_CEILING = "23:30";
const EM_CLOSED_STATUSES = ["Completada", "Cancelada"];

function em_time_slots() {
	const slots = [];
	for (let h = 0; h < 24; h++) {
		for (let m = 0; m < 60; m += 15) {
			const slot = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
			slots.push(slot);
			if (slot === EM_TIME_CEILING) return slots;
		}
	}
	return slots;
}

// Options for the end-time dropdown: only slots from (and including) the chosen
// start time through the day's ceiling — its "floor" moves with the start time.
function em_time_options_from(start_hhmm) {
	const slots = em_time_slots();
	return start_hhmm ? slots.filter((t) => t >= start_hhmm) : slots;
}

function em_suggest_end_time(start_hhmm) {
	const [h, m] = start_hhmm.split(":").map(Number);
	const [ceil_h, ceil_m] = EM_TIME_CEILING.split(":").map(Number);
	let total = Math.min(h * 60 + m + 60, ceil_h * 60 + ceil_m);
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Backend times arrive as "HH:MM:SS" (sometimes with microseconds) — our slot values
// are plain "HH:MM", so this just trims to match; unrelated to storage format.
function em_to_hhmm(val) {
	return val ? String(val).slice(0, 5) : "";
}

// Inline SVG icon set (feather-style strokes, inherit currentColor) — replaces the emoji
// that used to decorate cards/headers, so icons follow the theme (light/dark) and align
// with text instead of depending on each OS's emoji font.
const EM_ICONS = {
	calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
	repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
	refresh: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
	clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
	link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
	comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
	home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
	briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
	check: '<path d="M20 6L9 17l-5-5"/>',
	bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
	search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
	filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
	grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
	columns: '<rect x="3" y="3" width="6" height="18" rx="1"/><rect x="15" y="3" width="6" height="12" rx="1"/>',
	list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
	layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
	chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
	x: '<path d="M18 6L6 18M6 6l12 12"/>',
	alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
};

function em_icon(name, size = 12) {
	return `<svg class="em-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EM_ICONS[name] || ""}</svg>`;
}

class EisenhowerBoard {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		this.$body = $(page.body);
		this.view = localStorage.getItem("eisenhower_matrix:view_v3") || "midia";
		this.search = "";
		this.status_filter = "activas";
		this.task_type_filter = ""; // "" = Todas
		this.date_filter = "hoy_vencidas"; // filtro de fecha por defecto al cargar la página
		this.specific_date_filter = "";
		this.overdue_only = false;
		this.type_filter = { todas: true, individuales: false, compartidas: false, delegadas: false };
		this.calendar_period = localStorage.getItem("eisenhower_matrix:cal_period") || "month";
		this.calendar_anchor = frappe.datetime.get_today();
		this.activities = [];
		this.settings = null;
		this.extras = { projects: [], templates: [] };
		this.project_filter = "";
		this.tag_filter = "";
		this.selected = new Set();
		this._flashed_activity = null;

		this._inject_styles();
		this._render_shell();
		this._bind_events();
		this._bind_realtime();
		this._bind_shortcuts();
		this._bind_midia_events();
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
			.em-date-filter-hint { display: none; font-size: 11px; color: var(--text-muted); align-items: center;
				padding: 0 4px; white-space: nowrap; }
			.em-date-filter-hint.em-active { display: flex; }
			.em-type-filters { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted); }
			.em-type-filters label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
			.em-quadrants { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px;
				min-height: 560px; }
			.em-quadrant { position: relative; border-radius: 10px; padding: 0 10px 10px; background: var(--control-bg);
				border: 1px dashed var(--em-border); display: flex; flex-direction: column; min-height: 260px; }
			.em-quadrant.em-dragover { border-color: var(--text-color); background: var(--gray-100, #f4f5f6); }
			/* Folder-tab header: only this box carries the quadrant's identifying color,
			   not the whole quadrant. Full-bleed to the quadrant's top-left corner via
			   negative side margins, content-width via inline-flex. */
			.em-quadrant-head { margin: 0 -10px 10px; }
			.em-quadrant-tab { display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
				padding: 7px 14px 6px 12px; border-radius: 10px 12px 10px 0; color: #fff;
				box-shadow: 0 2px 5px rgba(0,0,0,.18); }
			.em-quadrant-title { font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap;
				overflow: hidden; text-overflow: ellipsis; }
			.em-quadrant-count { font-weight: 400; opacity: .82; }
			.em-quadrant-subtitle { font-size: 10px; text-transform: uppercase; letter-spacing: .02em;
				color: var(--text-muted); margin: 6px 0 0 12px; }
			.em-quadrant-help { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
				border-radius: 50%; border: 1px solid var(--em-border); color: var(--text-muted); font-size: 10px;
				font-style: italic; font-weight: 700; font-family: Georgia, serif; cursor: pointer;
				flex-shrink: 0; }
			.em-quadrant-help:hover { background: var(--control-bg); color: var(--text-color); }
			.em-quadrant-tab .em-quadrant-help { border-color: rgba(255,255,255,.55); color: #fff; }
			.em-quadrant-tab .em-quadrant-help:hover { background: rgba(255,255,255,.22); color: #fff; }
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
			.em-cal-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
			.em-cal-period-tabs { flex-wrap: wrap; }
			.em-cal-range { display: inline-block; text-align: center; font-weight: 600; color: var(--text-color); padding: 0 6px; }
			.em-cal-today-btn { width: auto !important; padding: 0 10px; font-size: 12px; }
			.em-cal-user-picker { margin-left: auto; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
			.em-cal-user-select { font-size: 12px; padding: 2px 6px; border: 1px solid var(--em-border); border-radius: 6px;
				background: var(--em-bg); max-width: 200px; }
			.em-cal-foreign-note { flex-basis: 100%; font-size: 12px; background: #e7f0ff; color: #1d4ed8;
				border-radius: 6px; padding: 4px 10px; }
			.em-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
			.em-cal-grid-week .em-cal-cell { min-height: 240px; }
			.em-cal-grid-biweek .em-cal-cell { min-height: 130px; }
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
			.em-cal-item-time { font-weight: 600; color: var(--text-muted); }
			.em-cal-more { font-size: 10px; color: var(--text-muted); cursor: pointer; padding-left: 5px; }
			.em-cal-more:hover { color: var(--text-color); }
			.em-cal-day { border: 1px solid var(--em-border); border-radius: 10px; overflow: hidden; }
			.em-cal-day.em-cal-today { border-color: var(--em-q1); }
			.em-cal-day-head { padding: 9px 14px; font-weight: 600; font-size: 13px; background: var(--control-bg);
				border-bottom: 1px solid var(--em-border); text-transform: capitalize; }
			.em-cal-day-count { color: var(--text-muted); font-weight: 400; }
			.em-cal-day-list { display: flex; flex-direction: column; }
			.em-cal-day-item { display: grid; grid-template-columns: 130px 1fr auto; gap: 12px; align-items: center;
				padding: 10px 14px; border-bottom: 1px solid var(--em-border); border-left: 3px solid var(--em-q4);
				cursor: pointer; font-size: 12px; }
			.em-cal-day-item:last-child { border-bottom: none; }
			.em-cal-day-item:hover { background: var(--control-bg); }
			.em-cal-day-time { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
			.em-cal-day-title { font-weight: 500; }
			.em-cal-day-status { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
			.em-card { position: relative; background: var(--em-bg); border: 1px solid var(--em-border); border-left: 4px solid var(--em-q4);
				border-radius: 8px; padding: 8px 26px 8px 10px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
			.em-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,.10); }
			.em-card.em-dragging { opacity: .4; }
			@keyframes em-flash-new { 0%, 100% { box-shadow: 0 0 0 0 rgba(94,100,255,0); } 50% { box-shadow: 0 0 0 4px rgba(94,100,255,.55); } }
			.em-card.em-flash-new { animation: em-flash-new .5s ease-in-out 8; }
			.em-snooze-btn { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; display: flex;
				align-items: center; justify-content: center; border: none; border-radius: 50%; background: var(--em-bg);
				box-shadow: 0 1px 3px rgba(0,0,0,.15); font-size: 11px; line-height: 1; cursor: pointer; opacity: .35;
				padding: 0; }
			.em-card:hover .em-snooze-btn { opacity: .85; }
			.em-snooze-btn:hover { opacity: 1 !important; background: var(--em-q2-bg, #e8eefc); }
			.em-snooze-menu { position: absolute; z-index: 1100; background: var(--em-bg); border: 1px solid var(--em-border);
				border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.18); padding: 4px; min-width: 170px; }
			.em-snooze-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px;
				border-radius: 5px; font-size: 12px; cursor: pointer; color: var(--text-color); }
			.em-snooze-opt:hover { background: var(--em-q2-bg, #eef2ff); }
			.em-snooze-opt-date { color: var(--text-muted); font-size: 11px; }
			.em-snooze-pick { border-top: 1px solid var(--em-border); margin-top: 2px; padding-top: 8px; justify-content: flex-start; }
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
			.em-invite-transfer { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); font-weight: 400; }
			.em-invite-user-picker .form-control, .em-invite-email.form-control { height: 30px; font-size: 12px; }
			.em-specific-date-filter .form-control { height: 30px; font-size: 12px; max-width: 150px; }
			.em-p-remove { cursor: pointer; color: var(--text-muted); font-weight: 700; padding: 0 4px; }
			.em-p-remove:hover { color: var(--em-q1); }
			.em-badge-external { background: #e7e9ff; color: #3b3fa0; }
			.em-badge-delegated { background: #fff0e0; color: #a3550a; }
			.em-delegation-banner { background: #fff0e0; color: #a3550a; border: 1px solid #f4c98e; border-radius: 6px;
				padding: 8px 12px; font-size: 12px; margin-bottom: 14px; }
			.em-overdue-date { color: #f08c00; font-weight: 600; }
			.em-badge-type { background: var(--control-bg); border: 1px solid var(--em-border); color: var(--text-muted); }
			.em-dialog-tabs { display: flex; gap: 4px; background: var(--control-bg); padding: 3px;
				border-radius: 8px; margin-bottom: 14px; }
			.em-dialog-tab-btn { flex: 1; border: none; background: transparent; padding: 7px 10px;
				border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; color: var(--text-muted); }
			.em-dialog-tab-btn.active { background: var(--em-bg); color: var(--text-color);
				box-shadow: 0 1px 2px rgba(0,0,0,.08); }
			/* Frappe's Quill editor defaults to a fixed 300px-tall box (quill.scss's
			   .ql-snow .ql-editor rule) — that alone was forcing the whole dialog to
			   scroll. Cut to 180px (-40%); "resize: vertical" still comes through from
			   that same rule, so the user can still drag it taller by hand if needed. */
			.em-activity-dialog .ql-editor { height: 180px !important; min-height: 80px; }
			.em-comment.em-comment-info { border-bottom: none; padding: 3px 0; font-style: italic; color: var(--text-muted); font-size: 11px; }
			.em-comment.em-comment-info .em-c-meta { font-size: 11px; margin-bottom: 0; display: inline; }
			.em-comment.em-comment-info .em-c-content { display: inline; margin-left: 4px; }
			.em-comment.em-comment-info .em-c-content:before { content: "— "; }
			.em-reschedule-badge { display: inline-block; margin-top: 4px; font-size: 11px; color: #a3550a;
				background: #fff0e0; border-radius: 10px; padding: 1px 8px; }
			.em-created-line { font-size: 11px; color: var(--text-muted); margin-bottom: 12px; }
			.em-follow-up-banner { background: var(--control-bg); border: 1px solid var(--em-border); border-radius: 6px;
				padding: 8px 12px; font-size: 12px; margin-bottom: 14px; cursor: pointer; }
			.em-follow-up-banner:hover { background: var(--em-bg); }
			.em-follow-up-list-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em;
				color: var(--text-muted); margin: 10px 0 4px; }
			.em-follow-up-item { font-size: 12px; padding: 4px 0; cursor: pointer; }
			.em-follow-up-item:hover { color: var(--em-q1); }
			/* ---- Recurrentes (linked series) tab ---- */
			.em-linked-head { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
			.em-linked-list { border: 1px solid var(--em-border); border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
			.em-linked-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; font-size: 12px;
				border-bottom: 1px solid var(--em-border); }
			.em-linked-row:last-child { border-bottom: 0; }
			.em-linked-row[data-open-activity] { cursor: pointer; }
			.em-linked-row[data-open-activity]:hover { background: var(--control-bg); }
			.em-linked-date { min-width: 96px; font-weight: 500; }
			.em-linked-when { text-transform: uppercase; font-size: 10px; letter-spacing: .03em; border-radius: 8px;
				padding: 1px 7px; background: var(--control-bg); color: var(--text-muted); }
			.em-linked-pasada .em-linked-when { opacity: .7; }
			.em-linked-futura .em-linked-when { background: #e7f0ff; color: #1d4ed8; }
			.em-linked-hoy .em-linked-when { background: #fff0e0; color: #a3550a; }
			.em-linked-current { background: var(--em-bg); font-weight: 600; }
			.em-linked-thisone { color: var(--text-muted); font-size: 11px; }
			/* ---- Reportes (KPI dashboard) ---- */
			.em-reports { padding: 4px 2px 24px; }
			.em-report-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
			.em-period-tabs { display: flex; gap: 4px; background: var(--control-bg); padding: 3px; border-radius: 8px; }
			.em-period-tabs button { border: none; background: transparent; padding: 6px 12px; border-radius: 6px;
				font-size: 12px; font-weight: 500; cursor: pointer; color: var(--text-muted); }
			.em-period-tabs button.active { background: var(--em-bg); color: var(--text-color); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
			.em-period-nav { display: flex; align-items: center; gap: 4px; }
			.em-period-nav button { border: 1px solid var(--em-border); background: var(--em-bg); border-radius: 6px;
				width: 28px; height: 28px; cursor: pointer; color: var(--text-color); }
			.em-period-range { font-size: 12px; color: var(--text-muted); min-width: 150px; }
			.em-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
			.em-stat-tile { background: var(--em-bg); border: 1px solid var(--em-border); border-radius: 8px; padding: 10px 12px; }
			.em-stat-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
			.em-stat-value { font-size: 22px; font-weight: 700; color: var(--text-color); line-height: 1.1; }
			.em-stat-delta { font-size: 11px; margin-top: 3px; font-weight: 600; }
			.em-stat-delta.em-up { color: #0ca30c; }
			.em-stat-delta.em-down { color: #d03b3b; }
			.em-stat-delta.em-flat { color: var(--text-muted); }
			.em-charts-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin: 20px 0; }
			.em-chart-card { background: var(--em-bg); border: 1px solid var(--em-border); border-radius: 8px; padding: 14px; }
			.em-chart-card h4 { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: var(--text-color); }
			.em-report-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
			.em-report-list-card { background: var(--em-bg); border: 1px solid var(--em-border); border-radius: 8px; padding: 14px; }
			.em-report-list-card h4 { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: var(--text-color); }
			@media (max-width: 900px) { .em-charts-row { grid-template-columns: 1fr; } }
			.em-qbar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; }
			.em-qbar-label { width: 90px; flex-shrink: 0; color: var(--text-color); }
			.em-qbar-track { flex: 1; background: var(--control-bg); border-radius: 5px; height: 14px; overflow: hidden; }
			.em-qbar-fill { height: 100%; border-radius: 5px; min-width: 2px; }
			.em-qbar-count { width: 26px; text-align: right; flex-shrink: 0; color: var(--text-muted); font-weight: 600; }
			.em-report-hint { font-size: 11px; color: var(--text-muted); margin: -10px 0 16px; }

			/* ================= Diseño v2 (capa de overrides) =================
			   Lo de arriba sigue vigente; este bloque lo refina y cambia colores fijos
			   por variables para que el modo oscuro de Frappe se vea bien. */
			.em-wrapper { --em-accent: #5e64ff; --em-card-shadow: 0 1px 2px rgba(16,24,40,.06);
				--em-hover-shadow: 0 6px 16px rgba(16,24,40,.12);
				--em-warn-bg: #fff4e6; --em-warn-fg: #a3550a; --em-ok-bg: #e6f6ea; --em-ok-fg: #1b6b2b;
				--em-pend-bg: #fff3bf; --em-pend-fg: #7a5c00; --em-bad-bg: #ffe3e3; --em-bad-fg: #9c1c1c;
				--em-info-bg: #e7f0ff; --em-info-fg: #1d4ed8; --em-ext-bg: #e7e9ff; --em-ext-fg: #3b3fa0; }
			[data-theme="dark"] .em-wrapper { --em-card-shadow: 0 1px 2px rgba(0,0,0,.4);
				--em-hover-shadow: 0 6px 16px rgba(0,0,0,.5);
				--em-warn-bg: #3d2a14; --em-warn-fg: #ffb870; --em-ok-bg: #16331f; --em-ok-fg: #7fd99a;
				--em-pend-bg: #3b3310; --em-pend-fg: #ffd966; --em-bad-bg: #3d1a1a; --em-bad-fg: #ff9a9a;
				--em-info-bg: #14264a; --em-info-fg: #8ab4ff; --em-ext-bg: #23264d; --em-ext-fg: #a9adff; }
			.em-ico { vertical-align: -2px; flex-shrink: 0; }
			.em-card, .em-quadrant, .em-kanban-col { --q: var(--em-q4); }

			/* Encabezado */
			.em-header { gap: 12px; margin-bottom: 12px; }
			.em-brand { font-size: 17px; letter-spacing: -.01em; }
			.em-views { padding: 3px; border-radius: 10px; gap: 2px; }
			.em-view-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px;
				transition: background .15s, color .15s; }
			.em-view-btn:hover:not(.active) { color: var(--text-color); }
			.em-view-btn.active { color: var(--em-accent); }
			.em-bell { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; transition: box-shadow .15s; }
			.em-bell:hover { box-shadow: var(--em-card-shadow); }

			/* Filtros colapsables */
			.em-filters-row { flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 14px; }
			.em-filters-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
			.em-search-wrap { position: relative; }
			.em-search-wrap .em-ico { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
			.em-search-wrap .em-search { padding-left: 30px; min-width: 220px; height: 32px; border-radius: 8px;
				background: var(--em-bg); color: var(--text-color); }
			.em-search:focus { outline: none; border-color: var(--em-accent); box-shadow: 0 0 0 3px rgba(94,100,255,.15); }
			.em-filter-toggle { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
				border: 1px solid var(--em-border); border-radius: 8px; background: var(--em-bg); color: var(--text-color);
				font-size: 12px; font-weight: 500; cursor: pointer; }
			.em-filter-toggle:hover, .em-filter-toggle.em-open { border-color: var(--em-accent); color: var(--em-accent); }
			.em-filter-count { background: var(--em-accent); color: #fff; border-radius: 10px; font-size: 10px;
				font-weight: 700; padding: 0 6px; line-height: 16px; display: none; }
			.em-filter-count.em-active { display: inline-block; }
			.em-filter-summary { font-size: 12px; color: var(--text-muted); }
			.em-filters-panel { display: none; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px;
				background: var(--control-bg); border-radius: 10px; }
			.em-filters-panel.em-open { display: flex; }
			.em-clear-filters { display: none; height: 32px; border-radius: 8px; align-items: center; gap: 4px; }
			.em-clear-filters.em-active { display: inline-flex; }
			.em-overdue-toggle { height: 32px; border-radius: 8px; }
			.em-overdue-toggle.em-active { background: var(--em-bad-bg); color: var(--em-bad-fg); }
			.em-type-filters { gap: 6px; }
			.em-type-filters label { border: 1px solid var(--em-border); border-radius: 16px; padding: 4px 12px;
				background: var(--em-bg); transition: all .15s; margin: 0; }
			.em-type-filters label input { display: none; }
			.em-type-filters label:hover { border-color: var(--em-accent); }
			.em-type-filters label:has(input:checked) { background: var(--em-accent); border-color: var(--em-accent); color: #fff; }

			/* Cuadrantes */
			.em-quadrants { gap: 14px; }
			.em-quadrant { border: 1px solid color-mix(in srgb, var(--q) 28%, var(--em-border));
				background: color-mix(in srgb, var(--q) 6%, var(--em-bg)); border-radius: 14px; padding: 12px; }
			.em-quadrant.em-dragover { border-color: var(--q); background: color-mix(in srgb, var(--q) 13%, var(--em-bg));
				box-shadow: 0 0 0 3px color-mix(in srgb, var(--q) 20%, transparent); }
			.em-quadrant-head { margin: 0 0 10px; }
			.em-quadrant-tab { background: transparent !important; color: var(--text-color); box-shadow: none; padding: 0;
				border-radius: 0; gap: 8px; }
			.em-quadrant-title { color: var(--text-color); font-size: 14px; font-weight: 700; }
			.em-quadrant-title:before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 3px;
				background: var(--q); margin-right: 8px; }
			.em-quadrant-count { background: color-mix(in srgb, var(--q) 18%, transparent); color: var(--text-color);
				border-radius: 10px; padding: 0 8px; font-size: 11px; font-weight: 600; opacity: 1; margin-left: 4px; }
			.em-quadrant-tab .em-quadrant-help { border-color: var(--em-border); color: var(--text-muted); }
			.em-quadrant-tab .em-quadrant-help:hover { background: var(--em-bg); color: var(--text-color); }
			.em-quadrant-subtitle { margin: 3px 0 0 18px; text-transform: none; font-size: 11px; letter-spacing: 0; }
			.em-add-btn { display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 8px; padding: 7px 10px;
				border: 1px dashed transparent; border-radius: 8px; background: transparent; color: var(--text-muted);
				font-size: 12px; cursor: pointer; transition: all .15s; }
			.em-add-btn:hover { border-color: var(--q, var(--em-accent)); color: var(--text-color);
				background: color-mix(in srgb, var(--q, var(--em-accent)) 8%, transparent); }
			.em-empty { padding: 22px 10px; opacity: .8; }

			/* Kanban */
			.em-kanban { gap: 14px; }
			.em-kanban-col { border: 1px solid var(--em-border); border-radius: 14px; padding: 12px; min-width: 270px;
				background: color-mix(in srgb, var(--q) 5%, var(--em-bg)); }
			.em-kanban-col.em-dragover { border-color: var(--q); background: color-mix(in srgb, var(--q) 12%, var(--em-bg)); }
			.em-kanban-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
			.em-kanban-head:before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--q); }
			.em-kanban-col[data-status="Abierta"] { --q: #4c6ef5; }
			.em-kanban-col[data-status="En Progreso"] { --q: #f08c00; }
			.em-kanban-col[data-status="Completada"] { --q: #2f9e44; }
			.em-kanban-col[data-status="Cancelada"] { --q: #868e96; }

			/* Tarjeta */
			.em-card { display: flex; align-items: flex-start; gap: 9px; padding: 10px 30px 10px 10px;
				border-left: 3px solid var(--q); border-radius: 10px; box-shadow: var(--em-card-shadow);
				transition: box-shadow .15s, transform .15s; }
			.em-card:hover { box-shadow: var(--em-hover-shadow); transform: translateY(-1px); }
			.em-card-main { flex: 1; min-width: 0; }
			.em-card-title { font-size: 13px; font-weight: 600; line-height: 1.35; margin-bottom: 6px; overflow-wrap: anywhere; }
			.em-card.em-done .em-card-title { text-decoration: line-through; color: var(--text-muted); font-weight: 500; }
			.em-card.em-done { opacity: .72; }
			.em-card-meta { gap: 6px; row-gap: 5px; }
			.em-card-meta .em-spacer { flex: 1; }
			.em-status-circle { flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; padding: 0; border-radius: 50%;
				border: 1.8px solid var(--q); background: transparent; color: #fff; display: inline-flex; align-items: center;
				justify-content: center; cursor: pointer; transition: background .15s, transform .15s; }
			.em-status-circle .em-ico { opacity: 0; transition: opacity .15s; }
			.em-status-circle:hover { background: color-mix(in srgb, var(--q) 25%, transparent); transform: scale(1.12); }
			.em-status-circle:hover .em-ico { opacity: .8; color: var(--q); }
			.em-status-circle.em-s-progress { background: conic-gradient(var(--q) 0 50%, transparent 50% 100%); }
			.em-status-circle.em-s-done { background: var(--q); }
			.em-status-circle.em-s-done .em-ico { opacity: 1; color: #fff; }
			.em-chip { display: inline-flex; align-items: center; gap: 4px; background: var(--control-bg); color: var(--text-muted);
				border-radius: 6px; padding: 1px 7px; font-size: 11px; line-height: 18px; white-space: nowrap; }
			.em-chip.em-overdue-date { background: var(--em-warn-bg); color: var(--em-warn-fg); }
			.em-chip.em-s-progress { background: var(--em-warn-bg); color: var(--em-warn-fg); font-weight: 600; }
			.em-mini { display: inline-flex; align-items: center; gap: 3px; color: var(--text-muted); font-size: 11px; }
			.em-badge-pill { font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
			.em-badge-pending { background: var(--em-pend-bg); color: var(--em-pend-fg); }
			.em-badge-accepted { background: var(--em-ok-bg); color: var(--em-ok-fg); }
			.em-badge-rejected { background: var(--em-bad-bg); color: var(--em-bad-fg); }
			.em-badge-external { background: var(--em-ext-bg); color: var(--em-ext-fg); }
			.em-badge-delegated { background: var(--em-warn-bg); color: var(--em-warn-fg); }
			.em-delegation-banner { background: var(--em-warn-bg); color: var(--em-warn-fg); border-color: var(--em-warn-fg); }
			.em-reschedule-badge { background: var(--em-warn-bg); color: var(--em-warn-fg); }
			.em-cal-foreign-note { background: var(--em-info-bg); color: var(--em-info-fg); }
			.em-linked-futura .em-linked-when { background: var(--em-info-bg); color: var(--em-info-fg); }
			.em-linked-hoy .em-linked-when { background: var(--em-warn-bg); color: var(--em-warn-fg); }
			.em-snooze-btn { top: 6px; right: 6px; color: var(--text-muted); opacity: 0; box-shadow: none; background: transparent; }
			.em-card:hover .em-snooze-btn { opacity: .8; }
			.em-snooze-btn:hover { background: var(--control-bg) !important; color: var(--text-color); }
			.em-avatar { width: 22px; height: 22px; background: var(--em-accent); }
			.em-avatar:first-child { margin-left: 0; }

			/* Lista */
			.em-list-table { border: 1px solid var(--em-border); border-radius: 10px; border-collapse: separate; border-spacing: 0;
				overflow: hidden; background: var(--em-bg); }
			.em-list-table th { background: var(--control-bg); font-size: 11px; text-transform: uppercase; letter-spacing: .03em;
				padding: 9px 10px; }
			.em-list-table td { padding: 9px 10px; }
			.em-list-table tr:last-child td { border-bottom: none; }
			.em-list-table .em-overdue-date { color: var(--em-warn-fg); }

			/* ---- Fase 2 ---- */
			.em-quick-add { display: flex; gap: 6px; margin-top: 8px; }
			.em-quick-input { flex: 1; height: 32px; padding: 0 10px; font-size: 12px; border: 1px solid var(--q, var(--em-accent));
				border-radius: 8px; background: var(--em-bg); color: var(--text-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--q, var(--em-accent)) 18%, transparent); }
			.em-quick-input:focus { outline: none; }
			.em-quick-more { border: none; background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; white-space: nowrap; }
			.em-quick-more:hover { color: var(--text-color); text-decoration: underline; }
			@keyframes em-pop { 0% { transform: scale(1); } 40% { transform: scale(1.04); } 100% { transform: scale(.97); opacity: .6; } }
			.em-card.em-completing { animation: em-pop .45s ease-out forwards; }
			.em-card.em-completing .em-status-circle .em-ico { opacity: 1; color: #fff; }
			.em-list-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
			.em-list-toolbar-label { font-size: 12px; color: var(--text-muted); }
			.em-list-table .em-group-row td { background: var(--control-bg); cursor: pointer; font-size: 12px; padding: 8px 10px; user-select: none; }
			.em-list-table .em-group-row:hover td { filter: brightness(.97); }
			.em-group-chevron { display: inline-block; width: 14px; transition: transform .15s; color: var(--text-muted); }
			.em-group-chevron.em-collapsed { transform: rotate(-90deg); }
			.em-group-count { color: var(--text-muted); font-size: 11px; margin-left: 4px; }
			.em-list-check { width: 34px; }
			.em-list-table tr.em-done .em-list-title { text-decoration: line-through; color: var(--text-muted); }
			.em-list-table .em-group-row ~ tr:hover { background: var(--control-bg); }

			/* Actividad como panel lateral deslizable (mismo diálogo, otra presentación) */
			.em-activity-dialog .modal-dialog { position: fixed !important; top: 0; right: 0; bottom: 0; margin: 0 !important;
				width: min(640px, 100vw) !important; max-width: none !important; height: 100vh; transform: translateX(100%);
				transition: transform .28s cubic-bezier(.2,.8,.2,1) !important; }
			.em-activity-dialog.show .modal-dialog, .em-activity-dialog.in .modal-dialog { transform: translateX(0); }
			.em-activity-dialog .modal-content { height: 100%; border-radius: 0; border: none; display: flex; flex-direction: column;
				box-shadow: -8px 0 30px rgba(0,0,0,.18); }
			.em-activity-dialog .modal-body { flex: 1; overflow-y: auto; }
			.em-activity-dialog .modal-header { padding-top: 16px; }
			@media (max-width: 768px) {
				.em-quadrants { grid-template-columns: 1fr; }
				.em-view-btn span { display: none; }
				.em-search-wrap, .em-search-wrap .em-search { width: 100%; }
			}

			/* ---- Fase 3 ---- */
			/* Mi día */
			.em-midia { max-width: 860px; margin: 0 auto; }
			.em-md-hero { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 16px; }
			.em-md-greet { font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
			.em-md-date { color: var(--text-muted); font-size: 13px; text-transform: capitalize; }
			.em-md-progress { min-width: 220px; }
			.em-md-progress-bar { height: 8px; border-radius: 6px; background: var(--control-bg); overflow: hidden; flex: 1; }
			.em-md-progress-bar span { display: block; height: 100%; border-radius: 6px; background: #2f9e44; transition: width .4s; }
			.em-md-progress-text { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
			.em-md-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
			.em-md-tile { background: var(--em-bg); border: 1px solid var(--em-border); border-radius: 12px; padding: 12px 14px; }
			.em-md-tile-value { font-size: 26px; font-weight: 700; line-height: 1.1; }
			.em-md-tile-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
			.em-md-bad { background: var(--em-bad-bg); border-color: transparent; } .em-md-bad .em-md-tile-value { color: var(--em-bad-fg); }
			.em-md-good { background: var(--em-ok-bg); border-color: transparent; } .em-md-good .em-md-tile-value { color: var(--em-ok-fg); }
			.em-md-q1 .em-md-tile-value { color: var(--em-q1); }
			.em-md-invites { display: flex; align-items: center; gap: 8px; background: var(--em-pend-bg); color: var(--em-pend-fg);
				border-radius: 10px; padding: 9px 14px; font-size: 12px; margin-bottom: 14px; cursor: pointer; }
			.em-md-invites span { margin-left: auto; font-weight: 700; text-decoration: underline; }
			.em-md-add { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--em-border);
				border-radius: 12px; background: var(--em-bg); margin-bottom: 18px; color: var(--text-muted); }
			.em-md-add:focus-within { border-color: var(--em-accent); box-shadow: 0 0 0 3px rgba(94,100,255,.15); }
			.em-md-add-input { flex: 1; border: none; outline: none; background: transparent; color: var(--text-color); font-size: 13px; height: 28px; }
			.em-md-add-quadrant { border: none; background: var(--control-bg); color: var(--text-color); border-radius: 8px; font-size: 11px; padding: 4px 6px; }
			.em-md-clear { display: flex; align-items: center; gap: 14px; background: var(--em-ok-bg); color: var(--em-ok-fg); border-radius: 12px;
				padding: 16px 18px; margin-bottom: 18px; font-size: 12px; }
			.em-md-clear b { font-size: 14px; }
			.em-md-section { margin-bottom: 20px; }
			.em-md-section-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
			.em-md-section-head .em-quadrant-count { background: var(--control-bg); }
			.em-md-overdue .em-md-section-head { color: var(--em-bad-fg); }
			.em-md-note { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--text-muted); }
			.em-md-list { display: flex; flex-direction: column; gap: 8px; }

			/* Línea de tiempo */
			.em-tl-scroll { overflow-x: auto; border: 1px solid var(--em-border); border-radius: 12px; background: var(--em-bg); }
			.em-tl-grid { min-width: 860px; --lw: 230px; }
			.em-tl-row { display: grid; grid-template-columns: var(--lw) repeat(var(--days), minmax(30px, 1fr)); align-items: stretch;
				border-bottom: 1px solid var(--em-border); cursor: pointer; position: relative; min-height: 38px; }
			.em-tl-row:last-child { border-bottom: none; }
			.em-tl-row:hover:not(.em-tl-head) { background: var(--control-bg); }
			.em-tl-head { cursor: default; min-height: 44px; position: sticky; top: 0; background: var(--control-bg); }
			.em-tl-label { grid-column: 1; grid-row: 1; display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: 12px;
				position: sticky; left: 0; background: inherit; z-index: 3; min-width: 0; }
			.em-tl-row:not(.em-tl-head) .em-tl-label { background: var(--em-bg); }
			.em-tl-row:hover:not(.em-tl-head) .em-tl-label { background: var(--control-bg); }
			.em-tl-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
			.em-tl-label.em-done .em-tl-title { text-decoration: line-through; color: var(--text-muted); }
			.em-tl-day { grid-row: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); }
			.em-tl-day b { font-size: 12px; color: var(--text-color); }
			.em-tl-cell { grid-row: 1; border-left: 1px solid var(--em-border); }
			.em-tl-weekend { background: color-mix(in srgb, var(--text-muted) 7%, transparent); }
			.em-tl-today { background: color-mix(in srgb, var(--em-accent) 10%, transparent); }
			.em-tl-day.em-tl-today b { color: var(--em-accent); }
			.em-tl-bar { grid-row: 1; align-self: center; height: 10px; border-radius: 5px; margin: 0 2px; z-index: 1;
				background: color-mix(in srgb, var(--em-q1) 35%, transparent); }
			.em-tl-mark { grid-row: 1; align-self: center; justify-self: center; width: 16px; height: 16px; border-radius: 50%;
				background: var(--q); z-index: 2; box-shadow: 0 0 0 3px var(--em-bg); }
			.em-tl-mark.em-done { opacity: .45; }
			.em-tl-nav { border: 1px solid var(--em-border); background: var(--em-bg); border-radius: 6px; height: 28px; min-width: 28px; cursor: pointer; color: var(--text-color); }
			.em-tl-today-btn { padding: 0 10px; font-size: 12px; }

			/* Vistas guardadas */
			.em-sv-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--em-border);
				border-radius: 8px; background: var(--em-bg); color: var(--text-color); font-size: 12px; font-weight: 500; cursor: pointer; }
			.em-sv-btn:hover { border-color: var(--em-accent); color: var(--em-accent); }
			.em-sv-menu { position: absolute; z-index: 1200; min-width: 220px; background: var(--fg-color, #fff); border: 1px solid var(--border-color);
				border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.2); padding: 6px; font-size: 12px; }
			.em-sv-title { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 6px 8px 2px; }
			.em-sv-item, .em-sv-save { display: flex; justify-content: space-between; align-items: center; padding: 7px 8px; border-radius: 6px; cursor: pointer; }
			.em-sv-item:hover, .em-sv-save:hover { background: var(--control-bg); }
			.em-sv-save { color: var(--em-accent); font-weight: 600; margin-top: 4px; border-top: 1px solid var(--border-color); border-radius: 0 0 6px 6px; gap: 6px; justify-content: flex-start; }
			.em-sv-del { border: none; background: transparent; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
			.em-sv-del:hover { color: var(--em-q1); }
			.em-sv-empty { color: var(--text-muted); padding: 6px 8px; font-style: italic; }

			/* Subtareas */
			.em-ck-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
			.em-ck-row { display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-bottom: 1px solid var(--em-border); font-size: 13px; }
			.em-ck-row .em-ck-cb { margin: 0; }
			.em-ck-text { flex: 1; overflow-wrap: anywhere; }
			.em-ck-done .em-ck-text { text-decoration: line-through; color: var(--text-muted); }
			.em-ck-del { border: none; background: transparent; color: var(--text-muted); font-size: 18px; cursor: pointer; opacity: 0; }
			.em-ck-row:hover .em-ck-del { opacity: 1; }
			.em-ck-del:hover { color: var(--em-q1); }
			.em-ck-add { margin-top: 10px; }
			.em-ck-input { width: 100%; height: 34px; border: 1px solid var(--em-border); border-radius: 8px; padding: 0 10px; background: var(--em-bg); color: var(--text-color); }
			.em-ck-input:focus { outline: none; border-color: var(--em-accent); }
			.em-tab-count { margin-left: 4px; font-size: 10px; opacity: .7; }

			/* Móvil */
			@media (max-width: 768px) {
				.em-header { gap: 8px; }
				.em-views { overflow-x: auto; max-width: 100%; flex-wrap: nowrap; scrollbar-width: none; }
				.em-views::-webkit-scrollbar { display: none; }
				.em-view-btn { padding: 8px 12px; flex-shrink: 0; }
				.em-bell { padding: 7px 10px; }
				.em-filters-main { gap: 6px; }
				.em-type-filters { overflow-x: auto; max-width: 100%; flex-wrap: nowrap; scrollbar-width: none; }
				.em-type-filters label { flex-shrink: 0; white-space: nowrap; }
				.em-filters-panel select { flex: 1 1 140px; }
				.em-kanban { scroll-snap-type: x mandatory; }
				.em-kanban-col { min-width: 84vw; scroll-snap-align: center; }
				.em-quadrants { min-height: 0; }
				.em-quadrant { min-height: 0; }
				.em-list-table { display: block; overflow-x: auto; white-space: nowrap; }
				.em-snooze-btn { opacity: .6; }
				.em-status-circle { width: 22px; height: 22px; }
				.em-card { padding-right: 34px; }
				.em-md-greet { font-size: 19px; }
				.em-md-progress { width: 100%; }
				.em-tl-grid { --lw: 130px; min-width: 700px; }
				.em-ck-del { opacity: 1; }
				.em-trash-zone { display: none !important; }
			}

			/* ---- Mejoras (proyectos, etiquetas, lista editable, masivo) ---- */
			.em-tag { display: inline-flex; align-items: center; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 8px;
				background: var(--em-info-bg); color: var(--em-info-fg); white-space: nowrap; margin-right: 2px; }
			.em-project-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; line-height: 18px; padding: 0 7px; border-radius: 6px;
				background: color-mix(in srgb, var(--pc) 14%, transparent); color: var(--text-color); white-space: nowrap; max-width: 160px;
				overflow: hidden; text-overflow: ellipsis; }
			.em-project-chip:before { content: ""; width: 7px; height: 7px; border-radius: 2px; background: var(--pc); flex-shrink: 0; }
			.em-move-btn { position: absolute; top: 6px; right: 28px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
				border: none; border-radius: 50%; background: transparent; color: var(--text-muted); cursor: pointer; opacity: 0; padding: 0;
				font-size: 14px; line-height: 1; letter-spacing: -1px; }
			.em-card:hover .em-move-btn { opacity: .8; }
			.em-move-btn:hover { background: var(--control-bg); color: var(--text-color); opacity: 1 !important; }
			.em-card.em-drop-before { box-shadow: 0 -3px 0 0 var(--em-accent), var(--em-card-shadow); }
			.em-list-wrap { overflow-x: auto; }
			.em-list-table .em-inline { border: 1px solid transparent; background: transparent; color: var(--text-color); border-radius: 6px;
				font-size: 12px; padding: 2px 4px; max-width: 160px; cursor: pointer; }
			.em-list-table .em-inline:hover:not(:disabled), .em-list-table .em-inline:focus { border-color: var(--em-border); background: var(--em-bg); outline: none; }
			.em-list-table .em-inline:disabled { cursor: default; opacity: .8; appearance: none; -webkit-appearance: none; }
			.em-list-table .em-inline-quadrant { border-left: 3px solid var(--q); }
			.em-list-table .em-inline-date { width: 132px; }
			.em-list-table .em-overdue-date .em-inline-date { color: var(--em-warn-fg); font-weight: 600; }
			.em-sort-th { cursor: pointer; user-select: none; white-space: nowrap; }
			.em-sort-th:hover, .em-sort-th.em-sorted { color: var(--text-color) !important; }
			.em-list-table tr.em-selected td { background: color-mix(in srgb, var(--em-accent) 8%, transparent); }
			.em-bulk-bar { position: sticky; top: 60px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px;
				margin-bottom: 10px; border-radius: 10px; background: var(--em-accent); color: #fff; font-size: 12px; box-shadow: var(--em-hover-shadow); }
			.em-bulk-bar .em-bulk, .em-bulk-bar select { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.12); color: #fff;
				border-radius: 7px; height: 28px; padding: 0 10px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
			.em-bulk-bar select option { color: var(--text-color); background: var(--fg-color, #fff); }
			.em-bulk-bar .em-bulk:hover { background: rgba(255,255,255,.25); }
			.em-col-opt { cursor: pointer; }
			.em-col-opt input { margin: 0; }
			.em-tl-span { grid-row: 1; align-self: center; height: 14px; border-radius: 7px; margin: 0 3px; z-index: 1;
				background: color-mix(in srgb, var(--q) 30%, transparent); border: 1px solid color-mix(in srgb, var(--q) 55%, transparent); }
			.em-tl-span.em-done { opacity: .45; }
			.em-tl-legend { margin-left: auto; font-size: 11px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
			.em-tl-legend i { display: inline-block; width: 18px; height: 8px; border-radius: 4px; }
			.em-tl-lg-span { background: color-mix(in srgb, var(--em-accent) 35%, transparent); }
			.em-tl-lg-bar { background: color-mix(in srgb, var(--em-q1) 35%, transparent); }
			.em-tl-lg-mark { width: 10px !important; height: 10px !important; border-radius: 50% !important; background: var(--em-accent); }
			.em-hdr-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--em-border); border-radius: 8px; padding: 5px 10px;
				font-size: 12px; background: var(--em-bg); color: var(--text-color); cursor: pointer; }
			.em-hdr-btn:hover { border-color: var(--em-accent); color: var(--em-accent); }
			.em-kbd-table kbd { min-width: 22px; display: inline-block; text-align: center; }
			@media (max-width: 768px) {
				.em-move-btn { opacity: .7; }
				.em-bulk-bar { top: 0; }
				.em-hdr-btn span { display: none; }
				.em-tl-legend { display: none; }
			}
		`;
		$("<style>").attr("id", "eisenhower-matrix-styles").html(css).appendTo("head");
	}

	// ---------------------------------------------------------------- shell
	_render_shell() {
		this.$body.addClass("em-wrapper").html(`
			<div class="em-header">
				<span class="em-brand"><b>Eisenhower</b> Matrix <span style="font-weight:400;font-size:12px">· by Chappsa</span></span>
				<div class="em-views">
					<button class="em-view-btn" data-view="midia" title="Atajo: 1">${em_icon("check", 14)}<span>Mi día</span></button>
					<button class="em-view-btn" data-view="cuadrante" title="Atajo: 2">${em_icon("grid", 14)}<span>Cuadrante</span></button>
					<button class="em-view-btn" data-view="kanban" title="Atajo: 3">${em_icon("columns", 14)}<span>Kanban</span></button>
					<button class="em-view-btn" data-view="lista" title="Atajo: 4">${em_icon("list", 14)}<span>Lista</span></button>
					<button class="em-view-btn" data-view="tarjetas" title="Atajo: 5">${em_icon("layout", 14)}<span>Tarjetas</span></button>
					<button class="em-view-btn" data-view="calendario" title="Atajo: 6">${em_icon("calendar", 14)}<span>Calendario</span></button>
					<button class="em-view-btn" data-view="timeline" title="Atajo: 7">${em_icon("clock", 14)}<span>Línea de tiempo</span></button>
					<button class="em-view-btn" data-view="reportes" title="Atajo: 8">${em_icon("chart", 14)}<span>Reportes</span></button>
				</div>
				<div class="em-spacer"></div>
				<button type="button" class="em-hdr-btn em-tpl-btn" title="Nueva actividad desde plantilla">${em_icon("layout", 13)}<span>Plantillas</span></button>
				<button type="button" class="em-hdr-btn em-kbd-btn" title="Atajos de teclado (?)">?</button>
				<div class="em-bell" title="Invitaciones pendientes">
					${em_icon("bell", 14)} Invitaciones <span class="em-badge" style="display:none">0</span>
				</div>
			</div>
			<div class="em-filters-row">
				<div class="em-filters-main">
					<div class="em-search-wrap">${em_icon("search", 14)}<input type="text" class="em-search" placeholder="Buscar actividad...  ( / )"></div>
					<button type="button" class="em-sv-btn" title="Vistas guardadas">${em_icon("layout", 13)} Vistas</button>
					<button type="button" class="em-filter-toggle" title="Atajo: F">${em_icon("filter", 13)} Filtros <span class="em-filter-count">0</span></button>
					<span class="em-filter-summary"></span>
					<label class="em-overdue-toggle">
						<input type="checkbox" class="em-overdue-filter"> ${em_icon("alert", 13)} Solo atrasadas
					</label>
					<button class="em-clear-filters">${em_icon("x", 12)} Limpiar filtros</button>
					<div class="em-spacer"></div>
					<div class="em-type-filters">
						<label><input type="checkbox" class="em-type-cb" data-type="todas" checked> Todas</label>
						<label><input type="checkbox" class="em-type-cb" data-type="individuales"> Individuales (mías)</label>
						<label><input type="checkbox" class="em-type-cb" data-type="compartidas"> Compartidas</label>
						<label><input type="checkbox" class="em-type-cb" data-type="delegadas"> Delegadas</label>
					</div>
				</div>
				<div class="em-filters-panel">
					<select class="em-status-filter">
						<option value="activas">Activas (Abierta + En Progreso)</option>
						<option value="">Todos los estados</option>
						<option value="Abierta">Abierta</option>
						<option value="En Progreso">En Progreso</option>
						<option value="Completada">Completada</option>
						<option value="Cancelada">Cancelada</option>
					</select>
					<select class="em-task-type-filter">
						<option value="">Todas (Personal + Laboral)</option>
						<option value="Personal">Personal</option>
						<option value="Laboral">Laboral</option>
					</select>
					<select class="em-project-filter"></select>
					<select class="em-tag-filter"></select>
					<select class="em-date-filter">
						<option value="">Todas las fechas</option>
						<option value="hoy">Hoy</option>
						<option value="manana">Mañana</option>
						<option value="hoy_vencidas">Hoy + Vencidas</option>
						<option value="programadas">Programadas (a futuro)</option>
						<option value="vencidas">Vencidas</option>
						<option value="sin_fecha">Sin fecha límite</option>
					</select>
					<span class="em-date-filter-hint" title="${__(
						"Con Completada/Cancelada, estos filtros de fecha se aplican a la fecha en que cambió el estado, no a la fecha límite"
					)}"></span>
					<span class="em-specific-date-filter" title="${__("Filtrar por una fecha específica")}"></span>
				</div>
			</div>
			<div class="em-board-body"></div>
			<div class="em-trash-zone" title="Soltar aquí para eliminar">🗑️</div>
		`);
		this.page.set_primary_action(__("Nueva actividad"), () => this.open_activity_dialog(), "add");
		this.page.add_menu_item(__("Nueva desde plantilla"), () => this.open_template_picker());
		this.page.add_menu_item(__("Gestionar plantillas"), () => frappe.set_route("List", "EU Activity Template"));
		this.page.add_menu_item(__("Gestionar proyectos"), () => frappe.set_route("List", "EU Project"));
		this.page.add_menu_item(__("Atajos de teclado"), () => this.show_shortcuts_help());

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

		// Reflect the initial in-memory filter state (e.g. the default "Hoy + Vencidas"
		// date filter) onto the freshly-rendered controls.
		this._sync_filter_controls();
	}

	_bind_events() {
		this.$body.on("click", ".em-view-btn", (e) => {
			// Los botones "Agrupar por" de la Lista reutilizan el estilo .em-view-btn pero no
			// son cambio de vista (no traen data-view): se atienden en .em-list-group-btn.
			if (!$(e.currentTarget).attr("data-view")) return;
			this.view = $(e.currentTarget).attr("data-view");
			localStorage.setItem("eisenhower_matrix:view_v3", this.view);
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
		this.$body.on("change", ".em-task-type-filter", (e) => {
			this.task_type_filter = e.target.value;
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
			this.task_type_filter = "";
			this.date_filter = "hoy_vencidas";
			this.specific_date_filter = "";
			this.specific_date_control.set_value("");
			this.overdue_only = false;
			this.project_filter = "";
			this.tag_filter = "";
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
		this.$body.on("click", ".em-sv-btn", (e) => {
			e.stopPropagation();
			this._open_saved_views_menu($(e.currentTarget));
		});
		this.$body.on("click", ".em-tl-nav", (e) => {
			const shift = Number($(e.currentTarget).attr("data-shift"));
			this.timeline_anchor = shift === 0 ? null : frappe.datetime.add_days(this._timeline_start(), shift);
			this.render_view();
		});
		this.$body.on("click", ".em-filter-toggle", () => {
			this.filters_open = !this.filters_open;
			this._update_filter_ui();
		});
		this.$body.on("click", ".em-status-circle", (e) => {
			e.stopPropagation();
			e.preventDefault();
			this.toggle_activity_done($(e.currentTarget).attr("data-status-toggle"));
		});
		this.$body.on("click", ".em-add-btn", (e) => {
			e.stopPropagation();
			this._open_quick_add($(e.currentTarget));
		});
		this.$body.on("click", ".em-group-row", (e) => {
			const key = `${this.list_group}:${$(e.currentTarget).attr("data-group")}`;
			this.list_collapsed[key] = !this.list_collapsed[key];
			this._save_list_prefs();
			this.render_view();
		});
		this.$body.on("click", ".em-list-group-btn", (e) => {
			e.stopPropagation();
			this.list_group = $(e.currentTarget).attr("data-list-group");
			this._save_list_prefs();
			this.render_view();
		});
		this.$body.on("click", ".em-bell", () => this.open_invitations_dialog());
		this.$body.on("click", "[data-open-activity]", (e) => {
			// Controles dentro de la fila/tarjeta (edición en línea, selección, menús) no abren el panel.
			if ($(e.target).closest(".em-inline, .em-sel-cb, .em-list-check, .em-move-btn, .em-snooze-btn, .em-status-circle").length) return;
			this.open_activity_dialog($(e.currentTarget).attr("data-open-activity"));
		});
		this.$body.on("change", ".em-project-filter", (e) => {
			this.project_filter = e.target.value;
			this.render_view();
		});
		this.$body.on("change", ".em-tag-filter", (e) => {
			this.tag_filter = e.target.value;
			this.render_view();
		});
		this.$body.on("click", ".em-move-btn", (e) => {
			e.stopPropagation();
			e.preventDefault();
			this._open_move_menu($(e.currentTarget).attr("data-move"), $(e.currentTarget));
		});
		this.$body.on("click", ".em-cols-btn", (e) => {
			e.stopPropagation();
			this._open_columns_menu($(e.currentTarget));
		});
		this.$body.on("click", ".em-sort-th", (e) => {
			const key = $(e.currentTarget).attr("data-sort");
			const cur = this.list_sort || {};
			this.list_sort = { key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" };
			this._save_list_prefs();
			this.render_view();
		});
		this.$body.on("change", ".em-sel-cb", (e) => {
			const n = $(e.currentTarget).attr("data-name");
			e.target.checked ? this.selected.add(n) : this.selected.delete(n);
			this.render_view();
		});
		this.$body.on("change", ".em-sel-all", (e) => {
			const names = this.visible_activities().map((a) => a.name);
			if (e.target.checked) names.forEach((n) => this.selected.add(n));
			else this.selected.clear();
			this.render_view();
		});
		this.$body.on("click", ".em-bulk", (e) => this._bulk_action($(e.currentTarget).attr("data-bulk")));
		this.$body.on("change", ".em-bulk-quadrant", (e) => e.target.value && this._bulk_action("quadrant", e.target.value));
		this.$body.on("change", ".em-bulk-project", (e) => e.target.value && this._bulk_action("project", e.target.value));
		this.$body.on("click", ".em-inline", (e) => e.stopPropagation());
		this.$body.on("change", ".em-inline-status", (e) => {
			const name = $(e.currentTarget).attr("data-name");
			this._call("eisenhower_matrix.api.activity.update_activity", { name, payload: JSON.stringify({ status: e.target.value }) }).then(() => this.refresh());
		});
		this.$body.on("change", ".em-inline-quadrant", (e) => {
			const [imp, urg] = e.target.value.split(",").map(Number);
			this.reclassify_activity($(e.currentTarget).attr("data-name"), !!imp, !!urg);
		});
		this.$body.on("change", ".em-inline-date", (e) => {
			this.snooze_activity($(e.currentTarget).attr("data-name"), e.target.value || null);
		});
		this.$body.on("change", ".em-inline-project", (e) => {
			const name = $(e.currentTarget).attr("data-name");
			this._call("eisenhower_matrix.api.activity.update_activity", { name, payload: JSON.stringify({ project: e.target.value || null }) }).then(() => this.refresh());
		});
		this.$body.on("click", ".em-tpl-btn", () => this.open_template_picker());
		this.$body.on("click", ".em-kbd-btn", () => this.show_shortcuts_help());
		this.$body.on("click", ".em-snooze-btn", (e) => {
			e.stopPropagation();
			e.preventDefault();
			this._open_snooze_menu($(e.currentTarget).attr("data-snooze"), $(e.currentTarget));
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

		if (activity && activity.recurrence_group) {
			this._confirm_delete_recurring(activity);
			return;
		}

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

	// An activity that belongs to a recurring series: ask which part of the series to
	// delete (just this one / this + all later ones / the whole series).
	_confirm_delete_recurring(activity) {
		const group = activity.recurrence_group;
		const members = this.activities.filter((a) => a.recurrence_group === group);
		const google_count = members.filter((a) => a.google_event_id).length;

		const SCOPE_BY_LABEL = {
			[__("Sólo esta actividad")]: "one",
			[__("Esta y las siguientes de la serie")]: "future",
			[__("Toda la serie recurrente")]: "all",
		};

		const d = new frappe.ui.Dialog({
			title: __("Eliminar actividad recurrente"),
			fields: [
				{
					fieldname: "info_html",
					fieldtype: "HTML",
					options: `<div class="em-empty">${__('"{0}" es parte de una serie recurrente de {1} actividades.', [
						frappe.utils.escape_html(activity.title),
						members.length,
					])}${
						google_count
							? " " + __("Se borrarán también {0} evento(s) en Google Calendar.", [google_count])
							: ""
					}</div>`,
				},
				{
					fieldname: "scope",
					fieldtype: "Select",
					label: __("¿Qué quieres eliminar?"),
					options: Object.keys(SCOPE_BY_LABEL).join("\n"),
					default: __("Sólo esta actividad"),
					reqd: 1,
				},
			],
			primary_action_label: __("Eliminar"),
			primary_action: (values) => {
				const scope = SCOPE_BY_LABEL[values.scope] || "one";
				d.hide();
				this._call("eisenhower_matrix.api.activity.delete_activity", {
					name: activity.name,
					scope,
				}).then(() => this.refresh());
			},
		});
		d.get_primary_btn().removeClass("btn-primary").addClass("btn-danger");
		d.show();
	}

	_sync_filter_controls() {
		this.$body.find(".em-search").val(this.search);
		this.$body.find(".em-status-filter").val(this.status_filter);
		this.$body.find(".em-task-type-filter").val(this.task_type_filter);
		this.$body.find(".em-date-filter").val(this.date_filter);
		const show_close_hint = EM_CLOSED_STATUSES.includes(this.status_filter) && this.view !== "calendario";
		this.$body
			.find(".em-date-filter-hint")
			.text(show_close_hint ? "🔁 por fecha de cierre" : "")
			.toggleClass("em-active", show_close_hint);
		this.$body.find(".em-overdue-filter").prop("checked", this.overdue_only);
		this.$body.find(".em-overdue-toggle").toggleClass("em-active", this.overdue_only);
		this.$body.find(".em-type-cb").each((_, el) => {
			el.checked = !!this.type_filter[$(el).attr("data-type")];
		});
	}

	// ---------------------------------------------------------------- creación rápida
	// "+ Añadir actividad" despliega un campo de título en el propio cuadrante: Enter crea
	// y deja el campo listo para la siguiente, Esc cancela. La fecha por defecto sigue el
	// filtro activo (Hoy / Hoy + Vencidas -> hoy, Mañana -> mañana) para que la tarea
	// nueva no desaparezca del tablero apenas se crea.
	_quick_add_due_date() {
		if (this.view === "calendario") return null;
		if (this.date_filter === "hoy" || this.date_filter === "hoy_vencidas") return frappe.datetime.get_today();
		if (this.date_filter === "manana") return frappe.datetime.add_days(frappe.datetime.get_today(), 1);
		return null;
	}

	_open_quick_add($btn) {
		this.$body.find(".em-quick-add").remove();
		this.$body.find(".em-add-btn").show();
		const imp = $btn.attr("data-important");
		const urg = $btn.attr("data-urgent");
		const $row = $(`
			<div class="em-quick-add">
				<input type="text" class="em-quick-input" maxlength="140" placeholder="${__("Título y Enter para crear · Esc para cancelar")}">
				<button type="button" class="em-quick-more" title="${__("Abrir formulario completo")}">${__("Más opciones")}</button>
			</div>`);
		$btn.hide().after($row);
		const $input = $row.find("input").focus();
		this._quick_add_target = { imp, urg };
		const close = () => {
			$row.remove();
			$btn.show();
			this._quick_add_target = null;
		};
		let busy = false;
		$input.on("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Escape") return close();
			if (e.key !== "Enter") return;
			const title = $input.val().trim();
			if (!title || busy) return;
			busy = true;
			const payload = {
				title,
				is_important: imp === "1" ? 1 : 0,
				is_urgent: urg === "1" ? 1 : 0,
				due_date: this._quick_add_due_date(),
			};
			this._call("eisenhower_matrix.api.activity.create_activity", { payload: JSON.stringify(payload) })
				.then((name) => {
					this._flash_activity(name);
					return this.refresh().then(() => {
						const $again = this.$body.find(`.em-add-btn[data-important="${imp}"][data-urgent="${urg}"]`);
						if ($again.length) this._open_quick_add($again);
					});
				})
				.catch(() => (busy = false));
		});
		$row.find(".em-quick-more").on("click", () => {
			const title = $input.val().trim();
			close();
			this.open_activity_dialog(null, {
				title,
				is_important: imp === "1" ? 1 : 0,
				is_urgent: urg === "1" ? 1 : 0,
			});
		});
	}

	// ---------------------------------------------------------------- atajos de teclado
	_bind_shortcuts() {
		const views = ["midia", "cuadrante", "kanban", "lista", "tarjetas", "calendario", "timeline", "reportes"];
		$(document).off("keydown.eisenhower").on("keydown.eisenhower", (e) => {
			if (!this.wrapper || !$(this.wrapper).is(":visible")) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if ($(e.target).closest("input, textarea, select, [contenteditable=true], .ql-editor").length) return;
			if ($(".modal.show, .modal.in").length) return;
			const k = e.key;
			if (k === "n" || k === "N") {
				e.preventDefault();
				this.open_activity_dialog();
			} else if (k === "/") {
				e.preventDefault();
				this.$body.find(".em-search").focus();
			} else if (k === "?") {
				e.preventDefault();
				this.show_shortcuts_help();
			} else if (k === "f" || k === "F") {
				e.preventDefault();
				this.$body.find(".em-filter-toggle").trigger("click");
			} else if (k >= "1" && k <= "8") {
				e.preventDefault();
				this.$body.find(`.em-view-btn[data-view="${views[Number(k) - 1]}"]`).trigger("click");
			}
		});
	}

	// ---------------------------------------------------------------- Mi día
	// Pantalla de inicio: lo que hay que hacer hoy en un vistazo. Ignora los filtros del
	// tablero a propósito (siempre muestra Atrasadas + Hoy + Próximos 7 días).
	render_midia() {
		const today = frappe.datetime.get_today();
		const week_end = frappe.datetime.add_days(today, 7);
		const is_open = (a) => !EM_CLOSED_STATUSES.includes(a.status);
		const rank = { "Hazlo Ya": 0, "Planifícalo": 1, "Delégalo": 2, "Elimínalo": 3 };
		const order = (a, b) =>
			(rank[a.effective_quadrant] ?? 9) - (rank[b.effective_quadrant] ?? 9) ||
			(a.start_time || "99").localeCompare(b.start_time || "99") ||
			(a.due_date || "").localeCompare(b.due_date || "");

		const open = this.activities.filter(is_open);
		const overdue = open.filter((a) => a.due_date && a.due_date < today).sort(order);
		const hoy = open.filter((a) => a.due_date === today).sort(order);
		const proximos = open.filter((a) => a.due_date && a.due_date > today && a.due_date <= week_end)
			.sort((a, b) => a.due_date.localeCompare(b.due_date) || order(a, b));
		const sin_fecha = open.filter((a) => !a.due_date).sort(order);
		const done_today = this.activities.filter((a) => a.status === "Completada" && a.closed_on === today).length;
		const hazlo_ya = open.filter((a) => a.effective_quadrant === "Hazlo Ya").length;
		const total_today = overdue.length + hoy.length + done_today;
		const pct = total_today ? Math.round((done_today / total_today) * 100) : 0;

		const hour = new Date().getHours();
		const greet = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
		const first = ((frappe.user_info(frappe.session.user) || {}).fullname || "").split(" ")[0];
		const date_txt = frappe.datetime
			.str_to_obj(today)
			.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
		const pending = this.pending_for_me().length;

		const tile = (label, value, cls = "") =>
			`<div class="em-md-tile ${cls}"><div class="em-md-tile-value">${value}</div><div class="em-md-tile-label">${label}</div></div>`;
		const section = (title, items, cls, note = "") =>
			items.length
				? `<div class="em-md-section ${cls}">
						<div class="em-md-section-head"><span>${title}</span><span class="em-quadrant-count">${items.length}</span>${note}</div>
						<div class="em-md-list">${items.map((a) => this.card_html(a)).join("")}</div>
					</div>`
				: "";

		const all_clear = !overdue.length && !hoy.length;
		return `
			<div class="em-midia">
				<div class="em-md-hero">
					<div>
						<div class="em-md-greet">${greet}${first ? ", " + frappe.utils.escape_html(first) : ""}</div>
						<div class="em-md-date">${date_txt}</div>
					</div>
					<div class="em-md-progress" title="${done_today} de ${total_today}">
						<div class="em-md-progress-bar"><span style="width:${pct}%"></span></div>
						<div class="em-md-progress-text">${total_today ? `${done_today} de ${total_today} hechas hoy` : "Sin pendientes para hoy"}</div>
					</div>
				</div>
				<div class="em-md-tiles">
					${tile("Atrasadas", overdue.length, overdue.length ? "em-md-bad" : "")}
					${tile("Para hoy", hoy.length)}
					${tile("Hechas hoy", done_today, done_today ? "em-md-good" : "")}
					${tile("Hazlo Ya", hazlo_ya, hazlo_ya ? "em-md-q1" : "")}
				</div>
				${pending ? `<div class="em-md-invites">${em_icon("bell", 14)} Tienes <b>${pending}</b> invitación(es) pendiente(s) <span>Ver</span></div>` : ""}
				<div class="em-md-add">
					${em_icon("plus", 14)}
					<input type="text" class="em-md-add-input" maxlength="140" placeholder="${__("Añadir algo para hoy y Enter…")}">
					<select class="em-md-add-quadrant" title="${__("Cuadrante")}">
						<option value="1,0">${frappe.utils.escape_html(this.quadrant_meta("Planifícalo").label)}</option>
						<option value="1,1">${frappe.utils.escape_html(this.quadrant_meta("Hazlo Ya").label)}</option>
						<option value="0,1">${frappe.utils.escape_html(this.quadrant_meta("Delégalo").label)}</option>
						<option value="0,0">${frappe.utils.escape_html(this.quadrant_meta("Elimínalo").label)}</option>
					</select>
				</div>
				${all_clear ? `<div class="em-md-clear">${em_icon("check", 22)}<div><b>${done_today ? "¡Todo al día!" : "Nada urgente por ahora"}</b><div>${done_today ? "Terminaste lo de hoy." : "Aprovecha para planificar lo importante."}</div></div></div>` : ""}
				${section("Atrasadas", overdue, "em-md-overdue")}
				${section("Hoy", hoy, "em-md-today")}
				${section("Próximos 7 días", proximos, "em-md-next")}
				${section("Sin fecha", sin_fecha.slice(0, 8), "em-md-nodate", sin_fecha.length > 8 ? `<span class="em-md-note">+${sin_fecha.length - 8} más (ver Lista)</span>` : "")}
			</div>`;
	}

	_bind_midia_events() {
		this.$body.on("keydown", ".em-md-add-input", (e) => {
			e.stopPropagation();
			if (e.key !== "Enter") return;
			const $input = $(e.currentTarget);
			const title = $input.val().trim();
			if (!title || this._md_busy) return;
			const [imp, urg] = this.$body.find(".em-md-add-quadrant").val().split(",").map(Number);
			this._md_busy = true;
			this._call("eisenhower_matrix.api.activity.create_activity", {
				payload: JSON.stringify({ title, is_important: imp, is_urgent: urg, due_date: frappe.datetime.get_today() }),
			})
				.then((name) => {
					this._flash_activity(name);
					return this.refresh();
				})
				.then(() => this.$body.find(".em-md-add-input").focus())
				.finally(() => (this._md_busy = false));
		});
		this.$body.on("click", ".em-md-invites", () => this.open_invitations_dialog());
	}

	// ---------------------------------------------------------------- línea de tiempo
	// Ventana de 21 días con una fila por actividad: marca en su fecha límite; las
	// atrasadas y abiertas dibujan una barra roja desde la fecha límite hasta hoy.
	// (No hay fecha de inicio en el modelo, por eso no es un Gantt de inicio-fin.)
	_timeline_start() {
		if (!this.timeline_anchor) this.timeline_anchor = frappe.datetime.add_days(frappe.datetime.get_today(), -3);
		return this.timeline_anchor;
	}

	render_timeline() {
		const N = 21;
		const start = this._timeline_start();
		const days = Array.from({ length: N }, (_, i) => frappe.datetime.add_days(start, i));
		const end = days[N - 1];
		const today = frappe.datetime.get_today();
		// Índice de un día respecto al inicio de la ventana (puede quedar fuera: <0 o >=N).
		const di = (d) => frappe.datetime.get_day_diff(d, start);
		const clamp = (i) => Math.max(0, Math.min(N - 1, i));
		const WD = ["D", "L", "M", "M", "J", "V", "S"];

		const rows = this.visible_activities({ ignore_date_filter: true })
			.filter((a) => {
				if (!a.due_date) return false;
				const s = a.start_date && a.start_date < a.due_date ? a.start_date : a.due_date;
				if (s <= end && a.due_date >= start) return true;
				return this.is_overdue(a) && a.due_date < start && today >= start; // barra de atraso que cruza la ventana
			})
			.sort((a, b) => (a.start_date || a.due_date).localeCompare(b.start_date || b.due_date) || a.due_date.localeCompare(b.due_date));

		const day_cls = (d) => {
			const wd = frappe.datetime.str_to_obj(d).getDay();
			return `${d === today ? " em-tl-today" : ""}${wd === 0 || wd === 6 ? " em-tl-weekend" : ""}`;
		};
		const head = days
			.map((d, i) => `<div class="em-tl-day${day_cls(d)}" style="grid-column:${i + 2}"><span>${WD[frappe.datetime.str_to_obj(d).getDay()]}</span><b>${d.slice(8, 10)}</b></div>`)
			.join("");
		const cells = days.map((d, i) => `<div class="em-tl-cell${day_cls(d)}" style="grid-column:${i + 2}"></div>`).join("");

		const body = rows
			.map((a) => {
				const meta = this.quadrant_meta(a.effective_quadrant);
				const done = EM_CLOSED_STATUSES.includes(a.status);
				let bars = "";
				// Barra de duración (inicio → fecha límite) cuando hay fecha de inicio.
				if (a.start_date && a.start_date < a.due_date) {
					const s = di(a.start_date), e = di(a.due_date);
					if (e >= 0 && s < N) {
						bars += `<div class="em-tl-span${done ? " em-done" : ""}" style="grid-column:${clamp(s) + 2} / ${clamp(e) + 3};--q:${meta.color}"
							title="${frappe.datetime.str_to_user(a.start_date)} → ${frappe.datetime.str_to_user(a.due_date)}"></div>`;
					}
				}
				// Atraso: de la fecha límite hasta hoy.
				if (this.is_overdue(a) && !done) {
					const from = di(a.due_date), to = di(today);
					if (to >= 0 && from < N) {
						bars += `<div class="em-tl-bar" style="grid-column:${clamp(from) + 2} / ${clamp(to) + 3}" title="${__("Atrasada desde")} ${frappe.datetime.str_to_user(a.due_date)}"></div>`;
					}
				}
				const d_i = di(a.due_date);
				const mark = d_i >= 0 && d_i < N
					? `<div class="em-tl-mark${done ? " em-done" : ""}" style="grid-column:${d_i + 2};--q:${meta.color}" title="${frappe.utils.escape_html(a.title)} · ${frappe.datetime.str_to_user(a.due_date)}${this.time_range_text(a)}"></div>`
					: "";
				return `<div class="em-tl-row" data-open-activity="${a.name}" style="--q:${meta.color}">
					<div class="em-tl-label${done ? " em-done" : ""}"><span class="em-dot" style="background:${meta.color}"></span>
						<span class="em-tl-title">${frappe.utils.escape_html(a.title)}</span></div>
					${cells}${bars}${mark}</div>`;
			})
			.join("");

		const range_txt = `${frappe.datetime.str_to_user(start)} – ${frappe.datetime.str_to_user(end)}`;
		return `
			<div class="em-timeline">
				<div class="em-cal-header">
					<div class="em-period-nav">
						<button type="button" class="em-tl-nav" data-shift="-7">‹</button>
						<button type="button" class="em-tl-nav em-tl-today-btn" data-shift="0">${__("Hoy")}</button>
						<button type="button" class="em-tl-nav" data-shift="7">›</button>
					</div>
					<span class="em-cal-range">${range_txt}</span>
					<span class="em-tl-legend"><i class="em-tl-lg-span"></i> ${__("Inicio → límite")} <i class="em-tl-lg-bar"></i> ${__("Atraso")} <i class="em-tl-lg-mark"></i> ${__("Fecha límite")}</span>
				</div>
				<div class="em-tl-scroll">
					<div class="em-tl-grid" style="--days:${N}">
						<div class="em-tl-row em-tl-head"><div class="em-tl-label"></div>${head}</div>
						${body || `<div class="em-empty">Sin actividades con fecha en este periodo</div>`}
					</div>
				</div>
			</div>`;
	}

	// ---------------------------------------------------------------- vistas guardadas
	_saved_views_key() {
		return `eisenhower_matrix:saved_views:${frappe.session.user}`;
	}

	_get_saved_views() {
		return this.saved_views || [];
	}

	// Vistas guardadas en el servidor (defaults del usuario): viajan entre dispositivos.
	_set_saved_views(list) {
		this.saved_views = list;
		frappe.call({
			method: "eisenhower_matrix.api.extras.set_ui_pref",
			args: { key: "em_saved_views", value: JSON.stringify(list) },
		});
	}

	_current_view_state() {
		return {
			view: this.view,
			search: this.search,
			status_filter: this.status_filter,
			task_type_filter: this.task_type_filter,
			date_filter: this.date_filter,
			specific_date_filter: this.specific_date_filter,
			overdue_only: this.overdue_only,
			project_filter: this.project_filter,
			tag_filter: this.tag_filter,
			type_filter: { ...this.type_filter },
		};
	}

	_apply_view_state(st) {
		const base = {
			search: "", status_filter: "activas", task_type_filter: "", date_filter: "hoy_vencidas",
			specific_date_filter: "", overdue_only: false, project_filter: "", tag_filter: "",
			type_filter: { todas: true, individuales: false, compartidas: false, delegadas: false },
		};
		Object.assign(this, base, st);
		this.type_filter = { ...(st.type_filter || base.type_filter) };
		localStorage.setItem("eisenhower_matrix:view_v3", this.view);
		this.specific_date_control.set_value(this.specific_date_filter || "");
		this._sync_filter_controls();
		this.render_view();
	}

	_open_saved_views_menu($btn) {
		$(".em-sv-menu").remove();
		const presets = [
			{ name: "Atrasadas", state: { view: "lista", date_filter: "vencidas" } },
			{ name: "Delegadas", state: { view: "lista", date_filter: "", type_filter: { todas: false, individuales: false, compartidas: false, delegadas: true } } },
			{ name: "Completadas", state: { view: "lista", status_filter: "Completada", date_filter: "" } },
		];
		const saved = this._get_saved_views();
		const item = (v, i, kind) =>
			`<div class="em-sv-item" data-kind="${kind}" data-i="${i}"><span>${frappe.utils.escape_html(v.name)}</span>${kind === "saved" ? '<button type="button" class="em-sv-del" title="Eliminar">×</button>' : ""}</div>`;
		const $menu = $(`
			<div class="em-sv-menu">
				<div class="em-sv-title">Sugeridas</div>${presets.map((v, i) => item(v, i, "preset")).join("")}
				<div class="em-sv-title">Mis vistas</div>
				${saved.length ? saved.map((v, i) => item(v, i, "saved")).join("") : '<div class="em-sv-empty">Aún no guardas ninguna</div>'}
				<div class="em-sv-save" data-kind="new">${em_icon("plus", 12)} Guardar vista actual…</div>
			</div>`);
		const off = $btn.offset();
		$menu.css({ top: off.top + $btn.outerHeight() + 4, left: off.left }).appendTo("body");
		const close = () => {
			$menu.remove();
			$(document).off("mousedown.emsv");
		};
		$(document).on("mousedown.emsv", (e) => {
			if (!$(e.target).closest(".em-sv-menu, .em-sv-btn").length) close();
		});
		$menu.on("click", ".em-sv-del", (e) => {
			e.stopPropagation();
			const i = Number($(e.currentTarget).closest(".em-sv-item").attr("data-i"));
			const list = this._get_saved_views();
			list.splice(i, 1);
			this._set_saved_views(list);
			close();
		});
		$menu.on("click", ".em-sv-item", (e) => {
			const $it = $(e.currentTarget);
			const i = Number($it.attr("data-i"));
			const v = $it.attr("data-kind") === "preset" ? presets[i] : saved[i];
			close();
			if (v) this._apply_view_state(v.state);
		});
		$menu.on("click", ".em-sv-save", () => {
			close();
			frappe.prompt(
				[{ fieldname: "name", fieldtype: "Data", label: __("Nombre de la vista"), reqd: 1 }],
				(vals) => {
					const list = this._get_saved_views().filter((v) => v.name !== vals.name);
					list.push({ name: vals.name, state: this._current_view_state() });
					this._set_saved_views(list);
					frappe.show_alert({ message: __("Vista guardada"), indicator: "green" });
				},
				__("Guardar vista"),
				__("Guardar")
			);
		});
	}

	// ---------------------------------------------------------------- subtareas (checklist)
	_render_checklist(d, activity, editable) {
		const $wrap = d.fields_dict.checklist_html.$wrapper;
		const items = activity.checklist || [];
		const done = items.filter((i) => i.done).length;
		const pct = items.length ? Math.round((done / items.length) * 100) : 0;
		const rows = items
			.map(
				(i) => `<div class="em-ck-row${i.done ? " em-ck-done" : ""}" data-row="${i.name}">
					<input type="checkbox" class="em-ck-cb" ${i.done ? "checked" : ""} ${editable ? "" : "disabled"}>
					<span class="em-ck-text">${frappe.utils.escape_html(i.item)}</span>
					${editable ? `<button type="button" class="em-ck-del" title="${__("Quitar")}">×</button>` : ""}
				</div>`
			)
			.join("");
		$wrap.html(`
			<div class="em-ck">
				${items.length ? `<div class="em-ck-progress"><div class="em-md-progress-bar"><span style="width:${pct}%"></span></div><small>${done}/${items.length}</small></div>` : ""}
				<div class="em-ck-list">${rows || `<div class="em-empty">${__("Sin subtareas")}</div>`}</div>
				${editable ? `<div class="em-ck-add"><input type="text" class="em-ck-input" maxlength="140" placeholder="${__("Nueva subtarea y Enter")}"></div>` : ""}
			</div>`);
		d.$wrapper.find('.em-dialog-tab-btn[data-tab="subtareas"] .em-tab-count').text(items.length ? `${done}/${items.length}` : "");

		const apply = (promise) =>
			promise.then((list) => {
				activity.checklist = list;
				this.render_view();
				this._render_checklist(d, activity, editable);
			});
		const api = "eisenhower_matrix.api.activity.";
		$wrap.find(".em-ck-input").on("keydown", (e) => {
			e.stopPropagation();
			if (e.key !== "Enter") return;
			const item = e.target.value.trim();
			if (!item) return;
			apply(this._call(api + "add_checklist_item", { activity: activity.name, item })).then(() =>
				d.fields_dict.checklist_html.$wrapper.find(".em-ck-input").focus()
			);
		});
		$wrap.find(".em-ck-cb").on("change", (e) => {
			const row = $(e.currentTarget).closest(".em-ck-row").attr("data-row");
			apply(this._call(api + "toggle_checklist_item", { activity: activity.name, row_name: row, done: e.target.checked ? 1 : 0 }));
		});
		$wrap.find(".em-ck-del").on("click", (e) => {
			const row = $(e.currentTarget).closest(".em-ck-row").attr("data-row");
			apply(this._call(api + "remove_checklist_item", { activity: activity.name, row_name: row }));
		});
	}

	// ---------------------------------------------------------------- proyectos / etiquetas
	project_color(name) {
		const p = ((this.extras && this.extras.projects) || []).find((x) => x.name === name);
		return (p && p.color) || "#5e64ff";
	}

	_project_options(selected) {
		const list = ((this.extras && this.extras.projects) || []).slice();
		if (selected && !list.some((p) => p.name === selected)) list.push({ name: selected, project_name: selected });
		return list
			.map((p) => `<option value="${frappe.utils.escape_html(p.name)}" ${p.name === selected ? "selected" : ""}>${frappe.utils.escape_html(p.project_name || p.name)}</option>`)
			.join("");
	}

	activity_tags(a) {
		return (a._user_tags || "").split(",").map((t) => t.trim()).filter(Boolean);
	}

	tags_html(a, max = 2) {
		const tags = this.activity_tags(a);
		if (!tags.length) return "";
		const shown = tags.slice(0, max).map((t) => `<span class="em-tag">#${frappe.utils.escape_html(t)}</span>`).join("");
		return shown + (tags.length > max ? `<span class="em-tag">+${tags.length - max}</span>` : "");
	}

	project_chip_html(a) {
		if (!a.project) return "";
		return `<span class="em-project-chip" style="--pc:${this.project_color(a.project)}" title="${__("Proyecto")}">${frappe.utils.escape_html(a.project)}</span>`;
	}

	_fill_extra_filters() {
		const $p = this.$body.find(".em-project-filter");
		$p.html(`<option value="">Todos los proyectos</option><option value="__none__">Sin proyecto</option>${this._project_options(this.project_filter && this.project_filter !== "__none__" ? this.project_filter : null)}`);
		$p.val(this.project_filter || "");
		const tags = [...new Set(this.activities.flatMap((a) => this.activity_tags(a)))].sort();
		if (this.tag_filter && !tags.includes(this.tag_filter)) tags.push(this.tag_filter);
		const $t = this.$body.find(".em-tag-filter");
		$t.html(`<option value="">Todas las etiquetas</option>${tags.map((t) => `<option value="${frappe.utils.escape_html(t)}">#${frappe.utils.escape_html(t)}</option>`).join("")}`);
		$t.val(this.tag_filter || "");
	}

	// ---------------------------------------------------------------- preferencias (servidor)
	_load_prefs(prefs) {
		if (this._prefs_loaded) return;
		this._prefs_loaded = true;
		prefs = prefs || {};
		const lp = prefs.em_list_prefs || {};
		this.list_group = lp.group || "cuadrante";
		this.list_collapsed = lp.collapsed || {};
		this.list_sort = lp.sort || { key: "due_date", dir: "asc" };
		this.list_hidden_cols = lp.hidden || ["tags"];
		this.saved_views = prefs.em_saved_views || null;
		// Migración única: vistas que se guardaron antes en el navegador.
		if (!this.saved_views) {
			let local = [];
			try {
				local = JSON.parse(localStorage.getItem(`eisenhower_matrix:saved_views:${frappe.session.user}`) || "[]");
			} catch (e) {
				local = [];
			}
			this.saved_views = local;
			if (local.length) this._set_saved_views(local);
		}
	}

	_save_list_prefs() {
		clearTimeout(this._list_prefs_timer);
		this._list_prefs_timer = setTimeout(() => {
			frappe.call({
				method: "eisenhower_matrix.api.extras.set_ui_pref",
				args: {
					key: "em_list_prefs",
					value: JSON.stringify({
						group: this.list_group, collapsed: this.list_collapsed,
						sort: this.list_sort, hidden: this.list_hidden_cols,
					}),
				},
				freeze: false,
			});
		}, 600);
	}

	// ---------------------------------------------------------------- menús flotantes
	_popover($anchor, html, on_click) {
		$(".em-sv-menu").remove();
		const $menu = $(`<div class="em-sv-menu">${html}</div>`);
		const off = $anchor.offset();
		$menu.appendTo("body");
		const left = Math.min(off.left, $(window).width() - $menu.outerWidth() - 8);
		$menu.css({ top: off.top + $anchor.outerHeight() + 4, left: Math.max(8, left) });
		const close = () => {
			$menu.remove();
			$(document).off("mousedown.empop");
		};
		setTimeout(() => {
			$(document).on("mousedown.empop", (e) => {
				if (!$(e.target).closest(".em-sv-menu").length) close();
			});
		}, 0);
		$menu.on("click", "[data-act]", (e) => {
			e.stopPropagation();
			const keep = on_click($(e.currentTarget).attr("data-act"), $(e.currentTarget), e);
			if (!keep) close();
		});
		return $menu;
	}

	_open_move_menu(name, $btn) {
		const a = this.activities.find((x) => x.name === name);
		if (!a) return;
		const q = { "Hazlo Ya": [1, 1], "Planifícalo": [1, 0], "Delégalo": [0, 1], "Elimínalo": [0, 0] };
		const done = EM_CLOSED_STATUSES.includes(a.status);
		const html = `
			<div class="em-sv-title">${__("Mover a cuadrante")}</div>
			${Object.keys(q).map((k) => `<div class="em-sv-item" data-act="q:${k}"><span><span class="em-dot" style="background:${this.quadrant_meta(k).color};margin:0 6px 0 0"></span>${frappe.utils.escape_html(this.quadrant_meta(k).label)}</span>${a.effective_quadrant === k ? "✓" : ""}</div>`).join("")}
			<div class="em-sv-title">${__("Estado")}</div>
			${["Abierta", "En Progreso", "Completada", "Cancelada"].map((s) => `<div class="em-sv-item" data-act="s:${s}"><span>${s}</span>${a.status === s ? "✓" : ""}</div>`).join("")}`;
		this._popover($btn, html, (act) => {
			const [kind, val] = act.split(/:(.+)/);
			if (kind === "q") {
				if (done) return frappe.show_alert({ message: __("Reabre la actividad para reclasificarla"), indicator: "orange" });
				this.reclassify_activity(name, !!q[val][0], !!q[val][1]);
			} else if (kind === "s" && val !== a.status) {
				this._call("eisenhower_matrix.api.activity.update_activity", { name, payload: JSON.stringify({ status: val }) }).then(() => this.refresh());
			}
		});
	}

	_open_columns_menu($btn) {
		const hidden = new Set(this.list_hidden_cols || []);
		const html = `<div class="em-sv-title">${__("Columnas visibles")}</div>
			${this._list_columns().filter((c) => !c.fixed).map((c) => `<label class="em-sv-item em-col-opt" data-act="${c.key}"><span>${c.label}</span><input type="checkbox" ${hidden.has(c.key) ? "" : "checked"}></label>`).join("")}`;
		this._popover($btn, html, (key, $el, e) => {
			e.preventDefault();
			const set = new Set(this.list_hidden_cols || []);
			set.has(key) ? set.delete(key) : set.add(key);
			this.list_hidden_cols = [...set];
			$el.find("input").prop("checked", !set.has(key));
			this._save_list_prefs();
			this.render_view();
			return true; // mantener abierto
		});
	}

	// ---------------------------------------------------------------- acciones masivas
	_reclassify_payload(a, important, urgent) {
		return a.owner === frappe.session.user
			? { is_important: important ? 1 : 0, is_urgent: urgent ? 1 : 0 }
			: { override_classification: 1, personal_important: important ? 1 : 0, personal_urgent: urgent ? 1 : 0 };
	}

	_run_bulk(build_payload, done_msg) {
		const targets = this.activities.filter((a) => this.selected.has(a.name));
		const calls = targets
			.map((a) => [a, build_payload(a)])
			.filter(([, p]) => p)
			.map(([a, p]) => this._call("eisenhower_matrix.api.activity.update_activity", { name: a.name, payload: JSON.stringify(p) }).catch(() => null));
		if (!calls.length) return frappe.show_alert({ message: __("Nada que cambiar en la selección"), indicator: "orange" });
		Promise.all(calls).then(() => {
			frappe.show_alert({ message: `${done_msg} (${calls.length})`, indicator: "green" });
			this.selected.clear();
			this.refresh();
		});
	}

	_bulk_action(kind, value) {
		const today = frappe.datetime.get_today();
		const open = (a) => !EM_CLOSED_STATUSES.includes(a.status);
		if (kind === "clear") {
			this.selected.clear();
			return this.render_view();
		}
		if (kind === "complete") return this._run_bulk((a) => (open(a) ? { status: "Completada" } : null), __("Completadas"));
		if (kind === "tomorrow") return this._run_bulk((a) => (open(a) ? { due_date: frappe.datetime.add_days(today, 1) } : null), __("Pospuestas a mañana"));
		if (kind === "week") return this._run_bulk((a) => (open(a) ? { due_date: frappe.datetime.add_days(today, 7) } : null), __("Pospuestas una semana"));
		if (kind === "quadrant") {
			const [imp, urg] = value.split(",").map(Number);
			return this._run_bulk((a) => (open(a) ? this._reclassify_payload(a, imp, urg) : null), __("Reclasificadas"));
		}
		if (kind === "project") {
			const project = value === "__none__" ? null : value;
			return this._run_bulk((a) => (open(a) && a.owner === frappe.session.user ? { project } : null), __("Proyecto asignado"));
		}
	}

	// ---------------------------------------------------------------- orden manual (cuadrante)
	_reorder_in_quadrant(dragged, before_name, $quadrant) {
		const a = this.activities.find((x) => x.name === dragged);
		if (!a) return;
		const imp = $quadrant.attr("data-important") === "1";
		const urg = $quadrant.attr("data-urgent") === "1";
		const flags = { "Hazlo Ya": "1,1", "Planifícalo": "1,0", "Delégalo": "0,1", "Elimínalo": "0,0" };
		const moved_quadrant = flags[a.effective_quadrant] !== `${imp ? 1 : 0},${urg ? 1 : 0}`;

		const names = $quadrant.find(".em-card").map((_, el) => $(el).attr("data-name")).get().filter((n) => n !== dragged);
		const at = before_name ? names.indexOf(before_name) : names.length;
		names.splice(at < 0 ? names.length : at, 0, dragged);

		const calls = [];
		names.forEach((n, i) => {
			const act = this.activities.find((x) => x.name === n);
			if (!act) return;
			const payload = {};
			// El orden (board_order) es del dueño; la reclasificación vale también para
			// participantes (como clasificación personal, ver _reclassify_payload).
			if (act.owner === frappe.session.user && (act.board_order || 0) !== i + 1) payload.board_order = i + 1;
			if (n === dragged && moved_quadrant && !EM_CLOSED_STATUSES.includes(act.status)) Object.assign(payload, this._reclassify_payload(act, imp, urg));
			if (Object.keys(payload).length) calls.push(this._call("eisenhower_matrix.api.activity.update_activity", { name: n, payload: JSON.stringify(payload) }));
		});
		if (calls.length) Promise.all(calls).then(() => this.refresh());
	}

	// ---------------------------------------------------------------- plantillas
	open_template_picker() {
		const templates = (this.extras && this.extras.templates) || [];
		if (!templates.length) {
			frappe.msgprint({
				title: __("Sin plantillas"),
				message: __("Aún no tienes plantillas. Abre una actividad y usa <b>Guardar como plantilla</b>, o créalas en <a href='/app/eu-activity-template'>Plantillas de actividad</a>."),
				indicator: "blue",
			});
			return;
		}
		const d = new frappe.ui.Dialog({
			title: __("Nueva actividad desde plantilla"),
			fields: [
				{
					fieldname: "template", fieldtype: "Select", label: __("Plantilla"), reqd: 1,
					options: templates.map((t) => ({ label: t.template_name, value: t.name })),
					default: templates[0].name,
				},
			],
			primary_action_label: __("Usar plantilla"),
			primary_action: (v) => {
				const t = templates.find((x) => x.name === v.template);
				d.hide();
				if (!t) return;
				this.open_activity_dialog(null, {
					title: t.title, description: t.description, task_type: t.task_type, project: t.project,
					is_important: t.is_important, is_urgent: t.is_urgent, template: t.name,
				});
			},
		});
		d.show();
	}

	show_shortcuts_help() {
		const rows = [
			["N", "Nueva actividad"], ["/", "Buscar"], ["F", "Mostrar / ocultar filtros"],
			["1", "Mi día"], ["2", "Cuadrante"], ["3", "Kanban"], ["4", "Lista"], ["5", "Tarjetas"],
			["6", "Calendario"], ["7", "Línea de tiempo"], ["8", "Reportes"], ["?", "Esta ayuda"],
		];
		frappe.msgprint({
			title: __("Atajos de teclado"),
			message: `<table class="table table-sm em-kbd-table">${rows.map(([k, l]) => `<tr><td><kbd>${k}</kbd></td><td>${l}</td></tr>`).join("")}</table>
				<div class="text-muted small">${__("Funcionan cuando no estás escribiendo en un campo.")}</div>`,
		});
	}

	// Filtros colapsables: muestra cuántos filtros se salen del valor por defecto y un
	// resumen legible (fecha · estado), para que quien ve "Hoy + Vencidas" sepa por qué
	// no aparece todo aunque el panel esté cerrado.
	_update_filter_ui() {
		const on_calendar = this.view === "calendario" || this.view === "timeline";
		const active =
			(this.search ? 1 : 0) +
			(this.status_filter !== "activas" ? 1 : 0) +
			(this.task_type_filter ? 1 : 0) +
			(!on_calendar && this.date_filter !== "hoy_vencidas" ? 1 : 0) +
			(this.specific_date_filter ? 1 : 0) +
			(this.overdue_only ? 1 : 0) +
			(this.project_filter ? 1 : 0) +
			(this.tag_filter ? 1 : 0) +
			(!this.type_filter.todas ? 1 : 0);
		this.$body.find(".em-filter-count").text(active).toggleClass("em-active", active > 0);
		this.$body.find(".em-clear-filters").toggleClass("em-active", active > 0);
		this.$body.find(".em-filter-toggle").toggleClass("em-open", !!this.filters_open);
		this.$body.find(".em-filters-panel").toggleClass("em-open", !!this.filters_open);
		const status_txt = this.status_filter === "activas" ? "Activas" : this.status_filter || "Todos los estados";
		const parts = [];
		if (!on_calendar) {
			parts.push(
				this.specific_date_filter
					? frappe.datetime.str_to_user(this.specific_date_filter)
					: this.$body.find(".em-date-filter option:selected").text()
			);
		}
		parts.push(status_txt);
		this.$body.find(".em-filter-summary").text(parts.filter(Boolean).join(" · "));
	}

	// Círculo de estado de la tarjeta: un clic completa la actividad, otro la reabre.
	toggle_activity_done(name) {
		const a = this.activities.find((x) => x.name === name);
		if (!a) return;
		const status = EM_CLOSED_STATUSES.includes(a.status) ? "Abierta" : "Completada";
		if (status === "Completada") {
			this.$body.find(`.em-card[data-name="${name}"]`).addClass("em-done em-completing");
			this.$body.find(`.em-status-circle[data-status-toggle="${name}"]`).addClass("em-s-done");
		}
		const wait = new Promise((r) => setTimeout(r, status === "Completada" ? 450 : 0));
		Promise.all([
			this._call("eisenhower_matrix.api.activity.update_activity", {
				name,
				payload: JSON.stringify({ status }),
			}),
			wait,
		]).then(() => {
			frappe.show_alert({
				message: status === "Completada" ? __("Actividad completada") : __("Actividad reabierta"),
				indicator: status === "Completada" ? "green" : "blue",
			});
			this.refresh();
		});
	}

	_bind_realtime() {
		frappe.realtime.on("eisenhower_activity_update", () => {
			if (!this.settings || this.settings.enable_realtime) this.refresh();
		});
	}

	// ---------------------------------------------------------------- data
	refresh() {
		// Force the Calendario "Ver actividades de" feed to reload after any board change.
		this.foreign_calendar = null;
		return Promise.all([
			this.settings ? Promise.resolve() : this._call("eisenhower_matrix.api.activity.get_settings").then((r) => (this.settings = r)),
			this._call("eisenhower_matrix.api.activity.get_board_data").then((r) => (this.activities = r || [])),
			this._call("eisenhower_matrix.api.extras.get_board_extras").then((r) => {
				this.extras = r || { projects: [], templates: [] };
				this._load_prefs(this.extras.prefs);
			}),
			this.report_share_users
				? Promise.resolve()
				: this._call("eisenhower_matrix.api.activity.get_report_share_users").then((r) => {
						this.report_share_users = r || [];
					}),
		]).then(() => this.render_view());
	}

	_call(method, args) {
		return frappe.call({ method, args }).then((r) => r.message);
	}

	// Briefly highlights an activity's card wherever it renders (its quadrant/kanban
	// column/date cell/etc.) so the user can see where it landed — used both for a
	// just-created activity and for one just edited (e.g. rescheduled to a future
	// date, which can move it somewhere off-screen with no other visual cue).
	_flash_activity(name) {
		this._flashed_activity = name;
		setTimeout(() => {
			if (this._flashed_activity === name) {
				this._flashed_activity = null;
				this.render_view();
			}
		}, 4100);
	}

	// Toast confirming a real edit was saved (never shown for no-op saves — the
	// backend only reports modified: true when a field actually changed). Uses
	// frappe.show_alert, Desk's standard corner toast, so it doesn't need its own
	// positioning/dismiss logic. Clicking it reopens the activity before it fades.
	_notify_activity_updated(name) {
		frappe.show_alert(
			{
				message: `<a data-action="open-activity">✅ ${__("Actividad")} ${name} ${__("modificada con éxito")}</a>`,
				indicator: "green",
			},
			3,
			{
				"open-activity": () => this.open_activity_dialog(name),
			}
		);
	}

	// Scrolls the card into view once it's rendered, in case it landed somewhere
	// below the fold (e.g. a long quadrant, or a kanban column scrolled sideways).
	_scroll_to_card(name) {
		const el = this.$body.find(`[data-open-activity="${name}"]`).get(0);
		if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	// Quick-snooze popover from the card's ⏰ button — reuses update_activity with a
	// due_date-only payload, so the lock check, reprogramado counter, log entry and
	// EU Activity Event all fire exactly like a full dialog edit would; only the UI
	// around it is a shortcut. Options are relative to today (not the current due
	// date), matching how "postpone" reads in every other task app.
	_close_snooze_menu() {
		if (this._snooze_menu) {
			this._snooze_menu.remove();
			this._snooze_menu = null;
		}
		this._snooze_menu_for = null;
		$(document).off("click.em-snooze-menu keydown.em-snooze-menu");
	}

	_open_snooze_menu(name, $btn) {
		const was_open_for_same = !!this._snooze_menu && this._snooze_menu_for === name;
		this._close_snooze_menu();
		if (was_open_for_same) return;
		this._snooze_menu_for = name;

		const today = frappe.datetime.get_today();
		const options = [
			{ label: __("Mañana"), date: frappe.datetime.add_days(today, 1) },
			{ label: __("En 3 días"), date: frappe.datetime.add_days(today, 3) },
			{ label: __("En 1 semana"), date: frappe.datetime.add_days(today, 7) },
		];
		const $menu = $(`
			<div class="em-snooze-menu">
				${options
					.map(
						(o) =>
							`<div class="em-snooze-opt" data-date="${o.date}">${o.label} <span class="em-snooze-opt-date">${frappe.datetime.str_to_user(o.date)}</span></div>`
					)
					.join("")}
				<div class="em-snooze-opt em-snooze-pick">📅 ${__("Elegir fecha...")}</div>
			</div>
		`).appendTo("body");

		const offset = $btn.offset();
		const menu_w = $menu.outerWidth();
		$menu.css({
			top: offset.top + $btn.outerHeight() + 4,
			left: Math.max(8, Math.min(offset.left, $(window).width() - menu_w - 10)),
		});

		$menu.on("click", ".em-snooze-opt", (e) => {
			e.stopPropagation();
			const $opt = $(e.currentTarget);
			this._close_snooze_menu();
			if ($opt.hasClass("em-snooze-pick")) {
				this._prompt_snooze_date(name);
			} else {
				this.snooze_activity(name, $opt.attr("data-date"));
			}
		});

		this._snooze_menu = $menu;
		setTimeout(() => {
			$(document).on("click.em-snooze-menu", () => this._close_snooze_menu());
			$(document).on("keydown.em-snooze-menu", (e) => {
				if (e.key === "Escape") this._close_snooze_menu();
			});
		}, 0);
	}

	_prompt_snooze_date(name) {
		frappe.prompt(
			{
				fieldname: "due_date",
				fieldtype: "Date",
				label: __("Nueva fecha límite"),
				reqd: 1,
				default: frappe.datetime.get_today(),
			},
			(values) => this.snooze_activity(name, values.due_date),
			__("Posponer actividad")
		);
	}

	snooze_activity(name, due_date) {
		this._call("eisenhower_matrix.api.activity.update_activity", {
			name,
			payload: JSON.stringify({ due_date }),
		}).then((result) => {
			if (result && result.modified) {
				this._notify_activity_updated(result.name);
				this._flash_activity(result.name);
				this.refresh().then(() => this._scroll_to_card(result.name));
			} else {
				this.refresh();
			}
		});
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

	// opts.ignore_date_filter — skip the Fecha dropdown / specific-date filter (the
	// Calendario view supplies its own range through the period navigator instead).
	visible_activities(opts = {}) {
		const today = frappe.datetime.get_today();
		// When the status filter is pinned to a closed status, the date-bucket filters
		// (Hoy, Vencidas, ...) stop meaning "due on/before/after today" — due_date is
		// unrelated to when the activity actually closed — and instead mean "closed
		// on/before/after today", using closed_on (see get_board_data). This keeps the
		// combination congruent no matter which filter the user picked first.
		const filtering_by_closure = EM_CLOSED_STATUSES.includes(this.status_filter);
		const filtered = this.activities.filter((a) => {
			if (this.search && !a.title.toLowerCase().includes(this.search)) return false;

			if (this.status_filter === "activas") {
				if (a.status !== "Abierta" && a.status !== "En Progreso") return false;
			} else if (this.status_filter && a.status !== this.status_filter) {
				return false;
			}

			if (this.task_type_filter && a.task_type !== this.task_type_filter) return false;
			if (this.project_filter === "__none__" ? a.project : this.project_filter && a.project !== this.project_filter) return false;
			if (this.tag_filter && !this.activity_tags(a).includes(this.tag_filter)) return false;

			const date_basis = filtering_by_closure ? a.closed_on : a.due_date;
			if (!opts.ignore_date_filter) {
				if (this.specific_date_filter) {
					if (date_basis !== this.specific_date_filter) return false;
				} else {
					if (this.date_filter === "hoy" && date_basis !== today) return false;
					if (this.date_filter === "manana" && date_basis !== frappe.datetime.add_days(today, 1)) return false;
					if (this.date_filter === "hoy_vencidas" && !(date_basis && date_basis <= today)) return false;
					if (this.date_filter === "programadas" && !(date_basis && date_basis > today)) return false;
					if (this.date_filter === "vencidas" && !(date_basis && date_basis < today)) return false;
					if (this.date_filter === "sin_fecha" && date_basis) return false;
				}
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

		// The report has its own period/task-type filters and doesn't read from the
		// board's filtered activity list at all, so the global filter bar (search,
		// status, dates, participation type) would just be noise — and misleadingly
		// suggest it affects numbers it has no effect on.
		this.$body.find(".em-filters-row").toggle(!["reportes", "midia"].includes(this.view));
		this._fill_extra_filters();
		this._update_filter_ui();

		// The Calendario view drives its own date range through the period navigator
		// (Día/Semana/Quincena/Mes + ◂ ▸ + Hoy), so the global date-bucket filters would
		// only fight it — hide them here and skip them in visible_activities() below.
		const on_calendar = this.view === "calendario" || this.view === "timeline";
		this.$body.find(".em-date-filter, .em-specific-date-filter").toggle(!on_calendar);

		const $out = this.$body.find(".em-board-body");
		if (this.view === "midia") $out.html(this.render_midia());
		else if (this.view === "timeline") $out.html(this.render_timeline());
		else if (this.view === "kanban") $out.html(this.render_kanban());
		else if (this.view === "lista") $out.html(this.render_list());
		else if (this.view === "tarjetas") $out.html(this.render_cards());
		else if (this.view === "calendario") $out.html(this.render_calendar());
		else if (this.view === "reportes") this.render_reports($out);
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

	// ---------------------------------------------------------------- reportes (KPI)
	// Unlike the other views, this one doesn't read from the already-loaded
	// this.activities — the KPI math (period buckets, event counts) is cheaper and
	// more correct done server-side, so this fetches its own data per period/filter
	// change and fills $out once the response lands.
	render_reports($out) {
		if (!this.report_period) this.report_period = "week";
		if (!this.report_anchor) this.report_anchor = frappe.datetime.get_today();
		if (this.report_task_type === undefined) this.report_task_type = "";
		if (this.report_for_user === undefined) this.report_for_user = ""; // "" = me

		$out.html('<div class="em-reports"><div class="em-empty">Cargando reporte...</div></div>');

		const request_token = (this._report_request_token = {});
		const share_users_promise = this.report_share_users
			? Promise.resolve()
			: this._call("eisenhower_matrix.api.activity.get_report_share_users").then((r) => {
					this.report_share_users = r || [];
				});

		share_users_promise
			.then(() =>
				this._call("eisenhower_matrix.api.activity.get_kpi_report", {
					period: this.report_period,
					anchor_date: this.report_anchor,
					task_type: this.report_task_type || undefined,
					for_user: this.report_for_user || undefined,
				})
			)
			.then((report) => {
				// The user may have switched period/filter/view again before this landed —
				// only the most recent request is allowed to paint.
				if (this._report_request_token !== request_token) return;
				this._render_report_content($out, report);
			});
	}

	_report_delta_html(value) {
		if (value === null || value === undefined) return `<span class="em-stat-delta em-flat">—</span>`;
		if (value > 0) return `<span class="em-stat-delta em-up">▲ ${value}%</span>`;
		if (value < 0) return `<span class="em-stat-delta em-down">▼ ${Math.abs(value)}%</span>`;
		return `<span class="em-stat-delta em-flat">= 0%</span>`;
	}

	_report_stat_tile(label, value, delta) {
		return `
			<div class="em-stat-tile">
				<div class="em-stat-label">${label}</div>
				<div class="em-stat-value">${value}</div>
				${delta !== undefined ? this._report_delta_html(delta) : ""}
			</div>
		`;
	}

	_report_list_html(title, rows, row_fn, empty_text) {
		const body = rows.length
			? rows.map((r) => `<div class="em-follow-up-item" data-open-activity="${r.name}">${row_fn(r)}</div>`).join("")
			: `<div class="em-empty">${empty_text}</div>`;
		return `<div class="em-report-list-card"><h4>${title} (${rows.length})</h4>${body}</div>`;
	}

	_render_report_content($out, report) {
		const period_labels = { day: __("Día"), week: __("Semana"), biweek: __("Quincena"), month: __("Mes") };
		const c = report.current;
		const d = report.deltas;
		const e = report.efficiency;
		const s = report.snapshot;

		const toolbar = `
			<div class="em-report-toolbar">
				<div class="em-period-tabs">
					${Object.keys(period_labels)
						.map(
							(p) =>
								`<button type="button" data-period="${p}" class="${p === report.period ? "active" : ""}">${period_labels[p]}</button>`
						)
						.join("")}
				</div>
				<div class="em-period-nav">
					<button type="button" class="em-period-prev" title="${__("Período anterior")}">←</button>
					<span class="em-period-range">${frappe.datetime.str_to_user(report.range.start, false, true)} – ${frappe.datetime.str_to_user(report.range.end, false, true)}</span>
					<button type="button" class="em-period-next" title="${__("Período siguiente")}">→</button>
					<button type="button" class="em-period-today">${__("Hoy")}</button>
				</div>
				<div class="em-spacer"></div>
				${
					this.report_share_users && this.report_share_users.length
						? `<select class="em-report-for-user">
							<option value="">${__("Yo")}</option>
							${this.report_share_users
								.map(
									(u) =>
										`<option value="${u.name}" ${this.report_for_user === u.name ? "selected" : ""}>${frappe.utils.escape_html(u.full_name || u.name)}</option>`
								)
								.join("")}
						</select>`
						: ""
				}
				<select class="em-report-task-type">
					<option value="">${__("Todas (Personal + Laboral)")}</option>
					<option value="Personal" ${this.report_task_type === "Personal" ? "selected" : ""}>${__("Personal")}</option>
					<option value="Laboral" ${this.report_task_type === "Laboral" ? "selected" : ""}>${__("Laboral")}</option>
				</select>
			</div>
		`;

		const stats_volume = [
			this._report_stat_tile(__("Creadas"), c.created, d.created),
			this._report_stat_tile(__("Completadas"), c.completed, d.completed),
			this._report_stat_tile(__("Canceladas"), c.cancelled, d.cancelled),
			this._report_stat_tile(__("Reprogramadas"), c.rescheduled, d.rescheduled),
			this._report_stat_tile(__("Seguimientos creados"), c.follow_ups, d.follow_ups),
		].join("");

		const stats_efficiency = [
			this._report_stat_tile(__("Tasa de cierre"), e.close_rate_pct !== null ? `${e.close_rate_pct}%` : "—"),
			this._report_stat_tile(
				__("Cumplimiento a tiempo"),
				e.on_time_pct !== null ? `${e.on_time_pct}%` : "—"
			),
			this._report_stat_tile(__("Reprog. prom. / cerrada"), e.avg_reschedules_per_closed),
			this._report_stat_tile(__("Atrasadas ahora"), s.overdue_count),
			this._report_stat_tile(__("Antigüedad prom. abiertas"), `${s.avg_open_age_days} d`),
		].join("");

		const quadrant_total = Object.values(report.quadrant_mix).reduce((a, b) => a + b, 0);
		const quadrant_rows = Object.keys(report.quadrant_mix)
			.map((key) => {
				const meta = this.quadrant_meta(key);
				const count = report.quadrant_mix[key];
				const pct = quadrant_total ? Math.round((count / quadrant_total) * 100) : 0;
				return `
					<div class="em-qbar-row">
						<span class="em-qbar-label">${meta.label}</span>
						<div class="em-qbar-track"><div class="em-qbar-fill" style="width:${pct}%;background:${meta.color}"></div></div>
						<span class="em-qbar-count">${count}</span>
					</div>
				`;
			})
			.join("");

		$out.html(`
			<div class="em-reports">
				${toolbar}
				<div class="em-report-hint">${__("Métricas de")} ${frappe.utils.escape_html(report.user_full_name || report.user)}${report.user !== frappe.session.user ? ` (${__("compartido contigo")})` : ""}. ${__("Reprogramadas y reabiertas se cuentan desde el 20/08/2026 (fecha en que empezamos a registrar ese histórico); creadas, completadas, canceladas y seguimientos no tienen ese límite.")}</div>
				<div class="em-stat-row">${stats_volume}</div>
				<div class="em-stat-row">${stats_efficiency}</div>
				<div class="em-charts-row">
					<div class="em-chart-card">
						<h4>${__("Creadas vs. completadas por día")}</h4>
						<div class="em-trend-chart"></div>
					</div>
					<div class="em-chart-card">
						<h4>${__("Cuadrante de lo cerrado en el período")}</h4>
						${quadrant_total ? quadrant_rows : `<div class="em-empty">${__("Nada cerrado en este período todavía")}</div>`}
					</div>
				</div>
				<div class="em-report-lists">
					${this._report_list_html(
						"⚠ " + __("Atrasadas ahora"),
						report.lists.overdue,
						(r) => `📅 ${frappe.datetime.str_to_user(r.due_date)} — ${frappe.utils.escape_html(r.title)}`,
						__("Nada atrasado 🎉")
					)}
					${this._report_list_html(
						"🔁 " + __("Más reprogramadas"),
						report.lists.most_rescheduled,
						(r) => `${r.reschedule_count}× — ${frappe.utils.escape_html(r.title)}`,
						__("Sin reprogramaciones acumuladas")
					)}
					${this._report_list_html(
						"✅ " + __("Completadas en el período"),
						report.lists.completed_in_period,
						(r) => frappe.utils.escape_html(r.title),
						__("Nada completado todavía")
					)}
					${this._report_list_html(
						"🕸 " + __("Estancadas (+14 días sin cambios)"),
						report.lists.stale,
						(r) => `${frappe.datetime.str_to_user(r.modified, false, true)} — ${frappe.utils.escape_html(r.title)}`,
						__("Nada estancado 🎉")
					)}
				</div>
			</div>
		`);

		new frappe.Chart(".em-trend-chart", {
			data: {
				labels: report.trend.map((t) => frappe.datetime.str_to_user(t.date, false, true)),
				datasets: [
					{ name: __("Creadas"), values: report.trend.map((t) => t.created) },
					{ name: __("Completadas"), values: report.trend.map((t) => t.completed) },
				],
			},
			type: "line",
			height: 220,
			colors: ["#2a78d6", "#1baf7a"],
			lineOptions: { hideDots: 0, regionFill: 0 },
			axisOptions: { xAxisMode: "tick", shortenYAxisNumbers: 1 },
		});

		this.$body.find(".em-period-tabs").on("click", "button", (e) => {
			this.report_period = $(e.currentTarget).attr("data-period");
			this.report_anchor = frappe.datetime.get_today();
			this.render_view();
		});
		this.$body.find(".em-period-prev").on("click", () => {
			this.report_anchor = this._shift_report_anchor(-1);
			this.render_view();
		});
		this.$body.find(".em-period-next").on("click", () => {
			this.report_anchor = this._shift_report_anchor(1);
			this.render_view();
		});
		this.$body.find(".em-period-today").on("click", () => {
			this.report_anchor = frappe.datetime.get_today();
			this.render_view();
		});
		this.$body.find(".em-report-task-type").on("change", (e) => {
			this.report_task_type = e.target.value;
			this.render_view();
		});
		this.$body.find(".em-report-for-user").on("change", (e) => {
			this.report_for_user = e.target.value;
			this.render_view();
		});
	}

	// Client-side mirror of the server's _shift_anchor() just for date math (day/
	// week/biweek/month step), so Prev/Next don't need a round trip before knowing
	// what to ask for next.
	_shift_report_anchor(steps) {
		const days = { day: 1, week: 7, biweek: 14 }[this.report_period];
		if (days) return frappe.datetime.add_days(this.report_anchor, steps * days);
		return frappe.datetime.add_months(this.report_anchor, steps);
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
				// Orden manual (board_order, al arrastrar dentro del cuadrante) primero; las
				// tarjetas sin orden manual siguen después, por fecha límite.
				const items = activities
					.filter((a) => a.effective_quadrant === q.key)
					.map((a, i) => [a, i])
					.sort(([a, i], [b, j]) => (a.board_order || 1e9) - (b.board_order || 1e9) || i - j)
					.map(([a]) => a);
				return `
					<div class="em-quadrant" data-important="${q.important}" data-urgent="${q.urgent}" style="--q:${meta.color}"
						title="${__("Doble clic para crear una actividad en este cuadrante")}">
						<div class="em-quadrant-head">
							<div class="em-quadrant-tab">
								<span class="em-quadrant-title">${frappe.utils.escape_html(meta.label)}
									<span class="em-quadrant-count">(${items.length})</span>
								</span>
								<span class="em-quadrant-help" data-quadrant-label="${frappe.utils.escape_html(meta.label)}"
									data-help-text="${frappe.utils.escape_html(q.help)}">i</span>
							</div>
							<div class="em-quadrant-subtitle">${q.standard}</div>
						</div>
						<div class="em-quadrant-cards">
							${items.map((a) => this.card_html(a)).join("") || '<div class="em-empty">Sin actividades</div>'}
						</div>
						<button type="button" class="em-add-btn" data-important="${q.important}" data-urgent="${q.urgent}">${em_icon("plus", 13)} ${__("Añadir actividad")}</button>
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
	// Columnas de la Lista: "title" siempre visible; el resto se puede ocultar (preferencia
	// guardada en el servidor). `sort` devuelve la clave de orden de cada fila.
	_list_columns() {
		const rank = { "Hazlo Ya": 0, "Planifícalo": 1, "Delégalo": 2, "Elimínalo": 3 };
		const st_rank = { Abierta: 0, "En Progreso": 1, Completada: 2, Cancelada: 3 };
		return [
			{ key: "title", label: "Título", fixed: true, sort: (a) => (a.title || "").toLowerCase() },
			{ key: "quadrant", label: "Cuadrante", sort: (a) => rank[a.effective_quadrant] ?? 9 },
			{ key: "project", label: "Proyecto", sort: (a) => (a.project || "~").toLowerCase() },
			{ key: "tags", label: "Etiquetas" },
			{ key: "task_type", label: "Tipo", sort: (a) => a.task_type || "" },
			{ key: "status", label: "Estado", sort: (a) => st_rank[a.status] ?? 9 },
			{ key: "due_date", label: "Fecha límite", sort: (a) => a.due_date || "9999-99-99" },
			{ key: "participants", label: "Participantes" },
			{ key: "comments", label: "Comentarios" },
		];
	}

	_list_cell(col, a) {
		const meta = this.quadrant_meta(a.effective_quadrant);
		const done = EM_CLOSED_STATUSES.includes(a.status);
		const read_only = !!(a.my_participant_status && a.my_participant_status !== "Aceptada");
		const lock = done || read_only ? "disabled" : "";
		switch (col.key) {
			case "title":
				return `<td class="em-list-title"><span class="em-dot" style="background:${meta.color}"></span> ${frappe.utils.escape_html(a.title)}
					${(a.checklist || []).length ? `<span class="em-mini">${em_icon("check", 11)} ${a.checklist.filter((c) => c.done).length}/${a.checklist.length}</span>` : ""}</td>`;
			case "quadrant": {
				const cur = `${a.is_important ? 1 : 0},${a.is_urgent ? 1 : 0}`;
				const flags = { "Hazlo Ya": "1,1", "Planifícalo": "1,0", "Delégalo": "0,1", "Elimínalo": "0,0" };
				const eff = flags[a.effective_quadrant] || cur;
				return `<td><select class="em-inline em-inline-quadrant" data-name="${a.name}" ${lock} style="--q:${meta.color}">
					${Object.entries(flags).map(([k, v]) => `<option value="${v}" ${v === eff ? "selected" : ""}>${frappe.utils.escape_html(this.quadrant_meta(k).label)}</option>`).join("")}
				</select></td>`;
			}
			case "project":
				return `<td><select class="em-inline em-inline-project" data-name="${a.name}" ${lock}>
					<option value="">—</option>
					${this._project_options(a.project)}
				</select></td>`;
			case "tags":
				return `<td>${this.tags_html(a, 3)}</td>`;
			case "task_type":
				return `<td>${em_icon(a.task_type === "Personal" ? "home" : "briefcase", 12)} ${a.task_type || "Laboral"}</td>`;
			case "status":
				return `<td><select class="em-inline em-inline-status" data-name="${a.name}" ${read_only ? "disabled" : ""}>
					${["Abierta", "En Progreso", "Completada", "Cancelada"].map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}
				</select></td>`;
			case "due_date":
				return `<td class="${this.is_overdue(a) ? "em-overdue-date" : ""}"><input type="date" class="em-inline em-inline-date" data-name="${a.name}" value="${a.due_date || ""}" ${lock}>${this.time_range_text(a)}</td>`;
			case "participants":
				return `<td>${this.avatars_html(a)}</td>`;
			case "comments":
				return `<td>${a.comment_count ? `${em_icon("comment", 12)} ${a.comment_count}` : ""}</td>`;
		}
		return "<td></td>";
	}

	render_list() {
		const activities = this.visible_activities();
		const group_by = this.list_group || "cuadrante";
		this.list_collapsed = this.list_collapsed || {};
		const hidden = new Set(this.list_hidden_cols || []);
		const cols = this._list_columns().filter((c) => c.fixed || !hidden.has(c.key));
		const sort = this.list_sort || { key: "due_date", dir: "asc" };
		const sort_col = this._list_columns().find((c) => c.key === sort.key && c.sort);

		// Selección: solo sobrevive lo que sigue visible.
		const visible_names = new Set(activities.map((a) => a.name));
		[...this.selected].forEach((n) => !visible_names.has(n) && this.selected.delete(n));

		const sorted = [...activities];
		if (sort_col) {
			const dir = sort.dir === "desc" ? -1 : 1;
			sorted.sort((a, b) => {
				const x = sort_col.sort(a), y = sort_col.sort(b);
				return (x < y ? -1 : x > y ? 1 : 0) * dir;
			});
		}

		const row_html = (a) => {
			const meta = this.quadrant_meta(a.effective_quadrant);
			const done = EM_CLOSED_STATUSES.includes(a.status);
			const circle_cls = done ? " em-s-done" : a.status === "En Progreso" ? " em-s-progress" : "";
			const sel = this.selected.has(a.name);
			return `
				<tr data-open-activity="${a.name}" class="${done ? "em-done" : ""}${sel ? " em-selected" : ""}">
					<td class="em-list-check"><input type="checkbox" class="em-sel-cb" data-name="${a.name}" ${sel ? "checked" : ""}></td>
					<td class="em-list-check"><button type="button" class="em-status-circle${circle_cls}" style="--q:${meta.color}" data-status-toggle="${a.name}" title="${done ? __("Reabrir") : __("Marcar como completada")}">${em_icon("check", 11)}</button></td>
					${cols.map((c) => this._list_cell(c, a)).join("")}
				</tr>`;
		};

		let groups;
		if (group_by === "estado") {
			groups = ["Abierta", "En Progreso", "Completada", "Cancelada"].map((st) => ({
				key: st, label: st,
				color: { Abierta: "#4c6ef5", "En Progreso": "#f08c00", Completada: "#2f9e44", Cancelada: "#868e96" }[st],
				items: sorted.filter((a) => a.status === st),
			}));
		} else if (group_by === "cuadrante") {
			groups = ["Hazlo Ya", "Planifícalo", "Delégalo", "Elimínalo"].map((k) => {
				const m = this.quadrant_meta(k);
				return { key: k, label: m.label, color: m.color, items: sorted.filter((a) => a.effective_quadrant === k) };
			});
		} else if (group_by === "proyecto") {
			const keys = [...new Set(sorted.map((a) => a.project || ""))].sort((a, b) => (a || "~").localeCompare(b || "~"));
			groups = keys.map((k) => ({
				key: k || "__none__", label: k || "Sin proyecto", color: k ? this.project_color(k) : "#adb5bd",
				items: sorted.filter((a) => (a.project || "") === k),
			}));
		} else {
			groups = [{ key: "todas", label: "", color: "", items: sorted }];
		}

		const all_checked = activities.length && activities.every((a) => this.selected.has(a.name));
		const ncols = cols.length + 2;
		const bodies = groups
			.filter((g) => g.items.length)
			.map((g) => {
				const collapsed = group_by !== "ninguno" && this.list_collapsed[`${group_by}:${g.key}`];
				const head = group_by === "ninguno" ? "" : `<tr class="em-group-row" data-group="${frappe.utils.escape_html(g.key)}">
						<td colspan="${ncols}"><span class="em-group-chevron${collapsed ? " em-collapsed" : ""}">▾</span>
							<span class="em-dot" style="background:${g.color}"></span>
							<b>${frappe.utils.escape_html(g.label)}</b> <span class="em-group-count">${g.items.length}</span></td>
					</tr>`;
				return `<tbody>${head}${collapsed ? "" : g.items.map(row_html).join("")}</tbody>`;
			})
			.join("");

		const th = (c) => {
			const active = sort.key === c.key;
			const arrow = active ? (sort.dir === "desc" ? " ↓" : " ↑") : "";
			return c.sort
				? `<th class="em-sort-th${active ? " em-sorted" : ""}" data-sort="${c.key}">${c.label}${arrow}</th>`
				: `<th>${c.key === "comments" ? "" : c.label}</th>`;
		};

		const switcher = `
			<div class="em-list-toolbar">
				<span class="em-list-toolbar-label">Agrupar por</span>
				<div class="em-views">
					${[["cuadrante", "Cuadrante"], ["estado", "Estado"], ["proyecto", "Proyecto"], ["ninguno", "Sin agrupar"]]
						.map(([k, l]) => `<button type="button" class="em-view-btn em-list-group-btn${group_by === k ? " active" : ""}" data-list-group="${k}"><span>${l}</span></button>`)
						.join("")}
				</div>
				<div class="em-spacer"></div>
				<button type="button" class="em-sv-btn em-cols-btn">${em_icon("columns", 13)} Columnas</button>
			</div>
			${this._bulk_bar_html()}`;

		if (!activities.length) return `${switcher}<div class="em-empty">Sin actividades</div>`;
		return `
			${switcher}
			<div class="em-list-wrap">
			<table class="em-list-table">
				<thead><tr><th class="em-list-check"><input type="checkbox" class="em-sel-all" ${all_checked ? "checked" : ""} title="${__("Seleccionar todo")}"></th><th></th>${cols.map(th).join("")}</tr></thead>
				${bodies}
			</table>
			</div>
		`;
	}

	_bulk_bar_html() {
		const n = this.selected.size;
		if (!n) return "";
		const q = { "Hazlo Ya": "1,1", "Planifícalo": "1,0", "Delégalo": "0,1", "Elimínalo": "0,0" };
		return `
			<div class="em-bulk-bar">
				<b>${n} ${n === 1 ? "seleccionada" : "seleccionadas"}</b>
				<button type="button" class="em-bulk" data-bulk="complete">${em_icon("check", 12)} Completar</button>
				<button type="button" class="em-bulk" data-bulk="tomorrow">${em_icon("clock", 12)} Mañana</button>
				<button type="button" class="em-bulk" data-bulk="week">${em_icon("calendar", 12)} +1 semana</button>
				<select class="em-bulk-quadrant"><option value="">Mover a…</option>
					${Object.entries(q).map(([k, v]) => `<option value="${v}">${frappe.utils.escape_html(this.quadrant_meta(k).label)}</option>`).join("")}
				</select>
				<select class="em-bulk-project"><option value="">Proyecto…</option><option value="__none__">— Sin proyecto</option>${this._project_options()}</select>
				<div class="em-spacer"></div>
				<button type="button" class="em-bulk em-bulk-clear" data-bulk="clear">${em_icon("x", 12)} Quitar selección</button>
			</div>`;
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
	// Monday-first, to match Frappe's week (get_first_day_of_week) — the same basis the
	// Reportes period navigator uses, so both views agree on where a "semana" starts.
	static WEEKDAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
	static CAL_PERIOD_LABELS = { day: "Día", week: "Semana", biweek: "Quincena", month: "Mes" };

	// [start, end] (inclusive, "YYYY-MM-DD") of the period the calendar is showing.
	// Mirrors api/activity.py::_period_bounds() so a "Semana"/"Quincena"/"Mes" here
	// lines up exactly with the same-named period in the Reportes view.
	_calendar_range() {
		const a = this.calendar_anchor;
		if (this.calendar_period === "day") return { start: a, end: a };
		if (this.calendar_period === "month") {
			return {
				start: moment(a).startOf("month").format("YYYY-MM-DD"),
				end: moment(a).endOf("month").format("YYYY-MM-DD"),
			};
		}
		const span = this.calendar_period === "biweek" ? 14 : 7;
		const start = moment(a).startOf("isoWeek");
		return {
			start: start.format("YYYY-MM-DD"),
			end: start.clone().add(span - 1, "days").format("YYYY-MM-DD"),
		};
	}

	_shift_calendar_anchor(steps) {
		const days = { day: 1, week: 7, biweek: 14 }[this.calendar_period];
		return days
			? moment(this.calendar_anchor).add(steps * days, "days").format("YYYY-MM-DD")
			: moment(this.calendar_anchor).add(steps, "months").format("YYYY-MM-DD");
	}

	render_calendar() {
		if (this.calendar_for_user === undefined) this.calendar_for_user = ""; // "" = mías

		// "Ver actividades de" — when set to another user, show THAT user's schedule
		// (read-only), never mixed with my own. The feed is fetched lazily; while it's
		// loading (foreign_calendar === null) show a placeholder and kick off the load.
		const foreign = !!this.calendar_for_user;
		if (foreign && this.foreign_calendar == null) {
			this._load_foreign_calendar();
			return `<div class="em-calendar">${this._calendar_user_select()}<div class="em-empty">${__("Cargando actividades...")}</div></div>`;
		}

		// The period navigator below IS this view's date filter, so the global date
		// buckets are skipped here (they're also hidden from the toolbar in render_view).
		const source = foreign
			? this.foreign_calendar
			: this.visible_activities({ ignore_date_filter: true });
		const by_date = {};
		source.forEach((a) => {
			if (!a.due_date) return;
			if (foreign && !a.effective_quadrant) a.effective_quadrant = a.quadrant;
			(by_date[a.due_date] = by_date[a.due_date] || []).push(a);
		});

		const today_str = frappe.datetime.get_today();
		const range = this._calendar_range();

		const period_tabs = Object.keys(EisenhowerBoard.CAL_PERIOD_LABELS)
			.map(
				(p) =>
					`<button type="button" data-period="${p}" class="${p === this.calendar_period ? "active" : ""}">${__(EisenhowerBoard.CAL_PERIOD_LABELS[p])}</button>`
			)
			.join("");

		const range_label =
			range.start === range.end
				? frappe.datetime.str_to_user(range.start)
				: `${frappe.datetime.str_to_user(range.start)} – ${frappe.datetime.str_to_user(range.end)}`;

		const header = `
			<div class="em-cal-header">
				<div class="em-period-tabs em-cal-period-tabs">${period_tabs}</div>
				<div class="em-period-nav">
					<button type="button" class="em-cal-prev" title="${__("Anterior")}">‹</button>
					<span class="em-period-range em-cal-range">${range_label}</span>
					<button type="button" class="em-cal-next" title="${__("Siguiente")}">›</button>
					<button type="button" class="em-period-today em-cal-today-btn">${__("Hoy")}</button>
				</div>
				${this._calendar_user_select()}
			</div>
			${
				foreign
					? `<div class="em-cal-foreign-note">👁️ ${__("Viendo la agenda de {0} (solo lectura)", [
							frappe.utils.escape_html(this._calendar_user_label(this.calendar_for_user)),
						])}</div>`
					: ""
			}
		`;

		const body =
			this.calendar_period === "day"
				? this._render_calendar_day(range.start, by_date, today_str)
				: this._render_calendar_grid(range, by_date, today_str);

		return `<div class="em-calendar">${header}${body}</div>`;
	}

	_cal_item_html(a) {
		const meta = this.quadrant_meta(a.effective_quadrant);
		const overdue_cls = this.is_overdue(a) ? " em-overdue-date" : "";
		const time = a.start_time ? `<span class="em-cal-item-time">${this.format_time(a.start_time)}</span> ` : "";
		// Another user's activity (from the "Ver actividades de" filter) is read-only:
		// clicking shows a details popup instead of opening the editor.
		const attr = this.calendar_for_user ? `data-foreign-activity="${a.name}"` : `data-open-activity="${a.name}"`;
		return `<div class="em-cal-item${overdue_cls}" ${attr} style="border-left-color:${meta.color}">${time}${frappe.utils.escape_html(a.title)}</div>`;
	}

	// Users who've shared their report/calendar with me (loaded in refresh()); "" = mine.
	_calendar_user_select() {
		const users = this.report_share_users || [];
		if (!users.length) return "";
		const opts = [`<option value="">${__("Mis actividades")}</option>`]
			.concat(
				users.map(
					(u) =>
						`<option value="${u.name}" ${this.calendar_for_user === u.name ? "selected" : ""}>${frappe.utils.escape_html(
							u.full_name || u.name
						)}</option>`
				)
			)
			.join("");
		return `<label class="em-cal-user-picker">${__("Ver actividades de")}: <select class="em-cal-user-select">${opts}</select></label>`;
	}

	_calendar_user_label(user) {
		const u = (this.report_share_users || []).find((x) => x.name === user);
		return u ? u.full_name || u.name : user;
	}

	_load_foreign_calendar() {
		if (this._loading_foreign === this.calendar_for_user) return;
		this._loading_foreign = this.calendar_for_user;
		const target = this.calendar_for_user;
		this._call("eisenhower_matrix.api.activity.get_calendar_activities", { for_user: target })
			.then((rows) => {
				if (this.calendar_for_user !== target) return; // user switched again meanwhile
				this.foreign_calendar = rows || [];
				this._loading_foreign = null;
				this.render_view();
			})
			.catch(() => {
				this._loading_foreign = null;
				this.foreign_calendar = [];
				this.render_view();
			});
	}

	_render_calendar_grid(range, by_date, today_str) {
		const is_month = this.calendar_period === "month";
		// Week/biweek ranges are already Monday-aligned and a whole number of weeks, so
		// they tile the 7-col grid exactly; only the month view needs leading/trailing
		// padding out to full weeks.
		const grid_start = is_month ? moment(range.start).startOf("isoWeek") : moment(range.start);
		const grid_end = is_month ? moment(range.end).endOf("isoWeek") : moment(range.end);
		const max_items = this.calendar_period === "week" ? 8 : 3;

		let cells = "";
		for (const d = grid_start.clone(); d.isSameOrBefore(grid_end, "day"); d.add(1, "day")) {
			const date_str = d.format("YYYY-MM-DD");
			if (date_str < range.start || date_str > range.end) {
				cells += '<div class="em-cal-cell em-cal-empty"></div>';
				continue;
			}
			const items = by_date[date_str] || [];
			const shown = items.slice(0, max_items);
			const extra = items.length - shown.length;
			const daynum =
				d.date() === 1
					? `1 ${EisenhowerBoard.MONTH_NAMES[d.month()].slice(0, 3)}`
					: d.date();
			cells += `
				<div class="em-cal-cell ${date_str === today_str ? "em-cal-today" : ""}">
					<div class="em-cal-daynum">${daynum}</div>
					<div class="em-cal-items">
						${shown.map((a) => this._cal_item_html(a)).join("")}
						${extra > 0 ? `<div class="em-cal-more" data-date="${date_str}">+${extra} ${__("más")}</div>` : ""}
					</div>
				</div>
			`;
		}

		const grid_cls = is_month ? "" : this.calendar_period === "week" ? " em-cal-grid-week" : " em-cal-grid-biweek";
		return `
			<div class="em-cal-grid em-cal-weekdays">
				${EisenhowerBoard.WEEKDAY_NAMES.map((w) => `<div class="em-cal-weekday">${w}</div>`).join("")}
			</div>
			<div class="em-cal-grid${grid_cls}">${cells}</div>
		`;
	}

	_render_calendar_day(date_str, by_date, today_str) {
		const items = (by_date[date_str] || [])
			.slice()
			.sort((a, b) => (a.start_time || "99:99").localeCompare(b.start_time || "99:99"));
		const is_today = date_str === today_str;
		const list = items.length
			? items
					.map((a) => {
						const meta = this.quadrant_meta(a.effective_quadrant);
						const overdue_cls = this.is_overdue(a) ? " em-overdue-date" : "";
						const when = this.time_range_text(a).trim() || "—";
						const attr = this.calendar_for_user
							? `data-foreign-activity="${a.name}"`
							: `data-open-activity="${a.name}"`;
						return `
							<div class="em-cal-day-item${overdue_cls}" ${attr} style="border-left-color:${meta.color}">
								<span class="em-cal-day-time">${when}</span>
								<span class="em-cal-day-title">${frappe.utils.escape_html(a.title)}</span>
								<span class="em-cal-day-status">${a.status}</span>
							</div>
						`;
					})
					.join("")
			: `<div class="em-empty">${__("Sin actividades para este día")}</div>`;
		return `
			<div class="em-cal-day ${is_today ? "em-cal-today" : ""}">
				<div class="em-cal-day-head">${frappe.datetime.str_to_user(date_str)}${is_today ? ` · ${__("Hoy")}` : ""} <span class="em-cal-day-count">(${items.length})</span></div>
				<div class="em-cal-day-list">${list}</div>
			</div>
		`;
	}

	_bind_calendar_events() {
		const $cal = this.$body.find(".em-calendar");
		if (!$cal.length) return;

		$cal.find(".em-cal-period-tabs button").on("click", (e) => {
			this.calendar_period = $(e.currentTarget).attr("data-period");
			localStorage.setItem("eisenhower_matrix:cal_period", this.calendar_period);
			this.render_view();
		});
		$cal.find(".em-cal-prev").on("click", () => {
			this.calendar_anchor = this._shift_calendar_anchor(-1);
			this.render_view();
		});
		$cal.find(".em-cal-next").on("click", () => {
			this.calendar_anchor = this._shift_calendar_anchor(1);
			this.render_view();
		});
		$cal.find(".em-cal-today-btn").on("click", () => {
			this.calendar_anchor = frappe.datetime.get_today();
			this.render_view();
		});
		$cal.find(".em-cal-more").on("click", (e) => {
			this.open_day_dialog($(e.currentTarget).attr("data-date"));
		});
		$cal.find(".em-cal-user-select").on("change", (e) => {
			this.calendar_for_user = e.target.value || "";
			this.foreign_calendar = null;
			this.render_view();
		});
		$cal.on("click", "[data-foreign-activity]", (e) => {
			const name = $(e.currentTarget).attr("data-foreign-activity");
			this._show_foreign_activity(name);
		});
	}

	_show_foreign_activity(name) {
		const a = (this.foreign_calendar || []).find((x) => x.name === name);
		if (!a) return;
		const rows = [
			[__("Fecha límite"), a.due_date ? frappe.datetime.str_to_user(a.due_date) : "—"],
			[__("Horario"), this.time_range_text(a).trim() || __("sin horario")],
			[__("Estado"), a.status],
			[__("Tipo"), a.task_type || "—"],
			[__("Responsable"), this.user_label(a.responsible_user) || "—"],
		];
		frappe.msgprint({
			title: frappe.utils.escape_html(a.title),
			indicator: "blue",
			message: `<table class="table table-bordered" style="margin:0"><tbody>${rows
				.map(([k, v]) => `<tr><td style="width:35%"><b>${k}</b></td><td>${frappe.utils.escape_html(String(v))}</td></tr>`)
				.join("")}</tbody></table>
				<div class="text-muted" style="margin-top:8px">${__("Solo lectura — actividad de otra persona.")}</div>`,
		});
	}

	open_day_dialog(date_str) {
		const foreign = !!this.calendar_for_user;
		const source = foreign ? this.foreign_calendar || [] : this.visible_activities({ ignore_date_filter: true });
		const items = source.filter((a) => a.due_date === date_str);
		const d = new frappe.ui.Dialog({
			title: frappe.datetime.str_to_user(date_str),
			fields: [{ fieldname: "list_html", fieldtype: "HTML" }],
		});
		const $wrap = d.fields_dict.list_html.$wrapper;
		if (!items.length) {
			$wrap.html(`<div class="em-empty">${__("Sin actividades")}</div>`);
		} else if (foreign) {
			$wrap.html(
				`<div class="em-cal-day-list">${items
					.map((a) => {
						const meta = this.quadrant_meta(a.effective_quadrant || a.quadrant);
						const when = this.time_range_text(a).trim() || "—";
						return `<div class="em-cal-day-item" data-foreign-activity="${a.name}" style="border-left-color:${meta.color}">
							<span class="em-cal-day-time">${when}</span>
							<span class="em-cal-day-title">${frappe.utils.escape_html(a.title)}</span>
							<span class="em-cal-day-status">${frappe.utils.escape_html(a.status)}</span>
						</div>`;
					})
					.join("")}</div>`
			);
			$wrap.on("click", "[data-foreign-activity]", (e) => {
				this._show_foreign_activity($(e.currentTarget).attr("data-foreign-activity"));
			});
		} else {
			$wrap.html(`<div class="em-cards-grid">${items.map((a) => this.card_html(a)).join("")}</div>`);
			$wrap.on("click", "[data-open-activity]", (e) => {
				const name = $(e.currentTarget).attr("data-open-activity");
				d.hide();
				this.open_activity_dialog(name);
			});
		}
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

	user_label(user) {
		if (!user) return "";
		return frappe.user_info ? frappe.user_info(user).fullname || user : user;
	}

	// Shown on the recipient's card/dialog once a task is delegated to them (who delegated
	// it), and on the delegator's own card (who they delegated it to).
	delegation_badge_html(a) {
		const participants = a.participants || [];
		const my_row = participants.find((p) => p.user === frappe.session.user && p.invite_role === "Delegado");
		if (my_row) {
			return `<span class="em-badge-pill em-badge-delegated">${em_icon("users", 11)} ${__("Delegada por")} ${frappe.utils.escape_html(this.user_label(a.owner))}</span>`;
		}
		if (a.owner === frappe.session.user) {
			const delegate_row = participants.find((p) => p.invite_role === "Delegado");
			if (delegate_row) {
				return `<span class="em-badge-pill em-badge-delegated">${em_icon("users", 11)} ${__("Delegada a")} ${frappe.utils.escape_html(this.user_label(delegate_row.user))}</span>`;
			}
		}
		return "";
	}

	card_html(a) {
		const meta = this.quadrant_meta(a.effective_quadrant);
		let badge = "";
		if (a.my_participant_status === "Pendiente") badge = '<span class="em-badge-pill em-badge-pending">Pendiente</span>';
		else badge = this.share_badges_html(a);
		const flash = a.name === this._flashed_activity ? " em-flash-new" : "";
		const can_snooze = !EM_CLOSED_STATUSES.includes(a.status);
		const done = EM_CLOSED_STATUSES.includes(a.status);
		const circle_cls = done ? " em-s-done" : a.status === "En Progreso" ? " em-s-progress" : "";
		const circle_title = done ? __("Reabrir") : __("Marcar como completada");
		const overdue = this.is_overdue(a);
		return `
			<div class="em-card${flash}${done ? " em-done" : ""}" draggable="true" data-name="${a.name}" data-open-activity="${a.name}" style="--q:${meta.color}">
				<button type="button" class="em-status-circle${circle_cls}" data-status-toggle="${a.name}" title="${circle_title}">${em_icon("check", 11)}</button>
				${can_snooze ? `<button type="button" class="em-snooze-btn" data-snooze="${a.name}" title="${__("Posponer")}">${em_icon("clock", 13)}</button>` : ""}
				<button type="button" class="em-move-btn" data-move="${a.name}" title="${__("Mover a…")}">⋯</button>
				<div class="em-card-main">
					<div class="em-card-title">${frappe.utils.escape_html(a.title)}</div>
					<div class="em-card-meta">
						${a.due_date ? `<span class="em-chip${overdue ? " em-overdue-date" : ""}">${em_icon("calendar", 11)} ${frappe.datetime.str_to_user(a.due_date)}${this.time_range_text(a)}</span>` : ""}
						${a.status === "En Progreso" ? '<span class="em-chip em-s-progress">En Progreso</span>' : done ? `<span class="em-chip">${a.status}</span>` : ""}
						${this.project_chip_html(a)}
						${this.tags_html(a)}
						${badge}
						${this.delegation_badge_html(a)}
						${a.is_rescheduled ? `<span class="em-mini" title="${__("Reprogramada")}">${em_icon("refresh", 12)} ${a.reschedule_count}</span>` : ""}
						${a.recurrence_group ? `<span class="em-mini" title="${__("Actividad recurrente")}: ${a.recurrence_frequency || ""}">${em_icon("repeat", 12)}</span>` : ""}
						${a.logged_hours ? `<span class="em-mini" title="${__("Horas registradas")}${a.is_billable ? " · " + __("Facturable") : ""}">${em_icon("clock", 12)} ${Number(a.logged_hours).toFixed(2)} h${a.is_billable ? " $" : ""}</span>` : ""}
						${a.follow_up_count ? `<span class="em-mini" title="${__("Tareas de seguimiento vinculadas")}">${em_icon("link", 12)} ${a.follow_up_count}</span>` : ""}
						${(a.checklist || []).length ? `<span class="em-mini" title="${__("Subtareas")}">${em_icon("check", 12)} ${a.checklist.filter((c) => c.done).length}/${a.checklist.length}</span>` : ""}
						${a.comment_count ? `<span class="em-mini" title="${__("Comentarios")}">${em_icon("comment", 12)} ${a.comment_count}</span>` : ""}
						<span class="em-mini" title="${a.task_type || "Laboral"}">${em_icon(a.task_type === "Personal" ? "home" : "briefcase", 12)}</span>
						<span class="em-spacer"></span>
						${this.avatars_html(a)}
					</div>
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
			self.$body.find(".em-drop-before").removeClass("em-drop-before");
			self.$body.find(".em-trash-zone").removeClass("em-visible").removeClass("em-dragover");
		});

		this.$body.find(".em-quadrant .em-card").on("dragover", function (e) {
			e.preventDefault();
			e.stopPropagation();
			self.$body.find(".em-drop-before").removeClass("em-drop-before");
			$(this).addClass("em-drop-before");
			$(this).closest(".em-quadrant").addClass("em-dragover");
		});
		this.$body.find(".em-quadrant .em-card").on("dragleave", function () {
			$(this).removeClass("em-drop-before");
		});
		this.$body.find(".em-quadrant .em-card").on("drop", function (e) {
			e.preventDefault();
			e.stopPropagation();
			$(this).removeClass("em-drop-before");
			const $q = $(this).closest(".em-quadrant").removeClass("em-dragover");
			const name = e.originalEvent.dataTransfer.getData("text/plain");
			const target = $(this).attr("data-name");
			if (!name || name === target) return;
			self._reorder_in_quadrant(name, target, $q);
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
		const delegated_to_me = !!(my_row && my_row.invite_role === "Delegado");

		// A Completada/Cancelada activity is locked — every field is read-only except
		// Estado itself, so the only way back in is reopening it (Abierta/En Progreso).
		// Enforced again server-side in update_activity, this is just the UI reflection.
		const locked = !!(activity && (activity.status === "Completada" || activity.status === "Cancelada"));
		const field_locked = view_only || locked;

		// Recurrence can be configured when creating an activity OR later, from the edit
		// dialog of a standalone activity that isn't already part of a series. Once a
		// series exists it's read-only (shown as a note in _render_meta).
		const can_set_recurrence = !field_locked && (!activity || !activity.recurrence_group);

		const start_default = activity ? em_to_hhmm(activity.start_time) : em_to_hhmm(init.start_time);
		const end_default = activity ? em_to_hhmm(activity.end_time) : em_to_hhmm(init.end_time);
		// `d` (the Dialog) doesn't exist yet while `fields` is being built below, but the
		// start_time change handler only runs later, once the user touches the control —
		// by then `d` has been assigned. `dialog_ready` keeps that handler from firing
		// while the dialog is still populating its own initial/default values.
		let d;
		let dialog_ready = false;

		const fields = [];
		if (activity) {
			fields.push({ fieldname: "meta_html", fieldtype: "HTML" });
		}
		if (locked && !view_only) {
			fields.push({
				fieldname: "locked_banner_html",
				fieldtype: "HTML",
				options: `<div class="em-delegation-banner">🔒 ${__("Esta actividad está")} <strong>${activity.status}</strong>. ${__("Cambia el estado a Abierta o En Progreso para poder editar los demás campos.")}</div>`,
			});
		}
		if (delegated_to_me) {
			const transfer_note = my_row.transfer_ownership
				? ` ${__("Al aceptar, la responsabilidad de la tarea pasará a ti.")}`
				: "";
			fields.push({
				fieldname: "delegation_banner_html",
				fieldtype: "HTML",
				options: `<div class="em-delegation-banner">🤝 ${__("Esta tarea te fue delegada por")} <strong>${frappe.utils.escape_html(this.user_label(activity.owner))}</strong>.${transfer_note}</div>`,
			});
		}
		fields.push(
			{ fieldname: "title", fieldtype: "Data", label: __("Título"), reqd: 1, default: activity ? activity.title : init.title || "", read_only: field_locked },
			{ fieldname: "description", fieldtype: "Text Editor", label: __("Descripción"), default: activity ? activity.description : init.description || "", read_only: field_locked },
			{ fieldname: "sec_clas", fieldtype: "Section Break", label: __("Clasificación") },
			{ fieldname: "is_important", fieldtype: "Check", label: __("Importante"), default: activity ? activity.is_important : init.is_important || 0, read_only: field_locked },
			{ fieldname: "col_clas", fieldtype: "Column Break" },
			{ fieldname: "is_urgent", fieldtype: "Check", label: __("Urgente"), default: activity ? activity.is_urgent : init.is_urgent || 0, read_only: field_locked },
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
				default: activity ? activity.task_type : init.task_type || "Laboral",
				read_only: field_locked,
			},
			{
				fieldname: "project",
				fieldtype: "Link",
				options: "EU Project",
				label: __("Proyecto"),
				default: activity ? activity.project || "" : init.project || "",
				read_only: field_locked,
				get_query: () => ({ filters: { status: "Activo" } }),
			},
			{
				fieldname: "tags",
				fieldtype: "Data",
				label: __("Etiquetas"),
				description: __("Separadas por coma. Ej.: cliente, urgente-legal"),
				default: activity ? this.activity_tags(activity).join(", ") : (init.tags || ""),
				read_only: field_locked,
			},
			{ fieldname: "col_seg", fieldtype: "Column Break" },
			{ fieldname: "start_date", fieldtype: "Date", label: __("Fecha de inicio"), description: __("Opcional: para verla como barra en la Línea de tiempo."), default: activity ? activity.start_date || "" : init.start_date || "", read_only: field_locked },
			{ fieldname: "due_date", fieldtype: "Date", label: __("Fecha límite"), default: activity ? activity.due_date : "", read_only: field_locked },
			{
				fieldname: "start_time",
				fieldtype: "Select",
				label: __("Hora de inicio"),
				options: ["", ...em_time_slots()].join("\n"),
				default: start_default,
				read_only: field_locked,
				// Google Calendar-style linking: picking a start time narrows the end-time
				// list to that point through the day's ceiling, and suggests +1h as the
				// end — but only overwrites an existing end time if it's no longer valid
				// (before the new start), so a deliberate choice isn't clobbered.
				change: () => {
					if (!dialog_ready) return;
					const start = d.get_value("start_time");
					const filtered = em_time_options_from(start);
					d.set_df_property("end_time", "options", ["", ...filtered].join("\n"));
					if (!start) return;
					const current_end = d.get_value("end_time");
					// Reassign if there's no end time yet, it's before the new start, or
					// (legacy data saved off the old free-form time picker) it isn't one of
					// today's 15-minute slots at all.
					if (!current_end || current_end < start || !filtered.includes(current_end)) {
						d.set_value("end_time", em_suggest_end_time(start));
					}
				},
			},
			{
				fieldname: "end_time",
				fieldtype: "Select",
				label: __("Hora de fin"),
				options: ["", ...em_time_options_from(start_default)].join("\n"),
				default: end_default,
				read_only: field_locked,
			}
		);

		if (has_google_sync) {
			fields.push({
				fieldname: "sync_to_google",
				fieldtype: "Check",
				label: __("Sincronizar con Google Calendar"),
				default: activity && activity.sync_to_google !== undefined ? activity.sync_to_google : 1,
				read_only: field_locked,
			});
		}

		fields.push(
			{
				fieldname: "sec_horas",
				fieldtype: "Section Break",
				label: __("Registro de horas"),
				collapsible: 1,
				collapsible_depends_on: "eval:doc.logged_hours || doc.is_billable",
			},
			{
				fieldname: "logged_hours",
				fieldtype: "Float",
				precision: 2,
				label: __("Horas registradas"),
				description: __("Tiempo dedicado, en horas. Puedes escribir hasta 2 decimales (p. ej. 1.50)."),
				default: activity ? activity.logged_hours || 0 : 0,
				read_only: field_locked,
			},
			{ fieldname: "col_horas", fieldtype: "Column Break" },
			{
				fieldname: "is_billable",
				fieldtype: "Check",
				label: __("Tiempo facturable"),
				default: activity ? activity.is_billable || 0 : 0,
				read_only: field_locked,
			}
		);

		// Configurable at creation and, later, from the edit dialog of a standalone
		// activity (see can_set_recurrence). An activity already in a series shows a
		// read-only note in _render_meta instead.
		if (can_set_recurrence) {
			fields.push(
				{
					fieldname: "sec_recur",
					fieldtype: "Section Break",
					label: __("Recurrencia"),
					collapsible: 1,
					collapsible_depends_on: "eval:doc.is_recurring",
				},
				{
					fieldname: "is_recurring",
					fieldtype: "Check",
					label: activity ? __("Convertir en actividad recurrente") : __("Repetir esta actividad"),
					default: 0,
				},
				{
					fieldname: "recur_help_html",
					fieldtype: "HTML",
					options: `<div class="em-empty">${__(
						"Se crea una actividad independiente por cada fecha de la serie. Los participantes no se copian. Máximo 104 ocurrencias."
					)}</div>`,
					depends_on: "eval:doc.is_recurring",
				},
				{
					fieldname: "recurrence_frequency",
					fieldtype: "Select",
					label: __("Frecuencia"),
					// No empty first option / no mandatory_depends_on on purpose: a hidden
					// Select with a default can report an empty value to the dialog's
					// mandatory check, which silently blocks "Guardar" (just an error beep,
					// no message). primary_action validates the recurrence inputs explicitly
					// and shows a real message instead.
					options: "Diaria\nSemanal\nQuincenal\nMensual\nTrimestral\nAnual",
					default: "Semanal",
					depends_on: "eval:doc.is_recurring",
				},
				{ fieldname: "col_recur", fieldtype: "Column Break" },
				{
					fieldname: "recurrence_end_date",
					fieldtype: "Date",
					label: __("Repetir hasta"),
					depends_on: "eval:doc.is_recurring",
				},
				{
					fieldname: "recurrence_count",
					fieldtype: "Int",
					label: __("O número de repeticiones"),
					description: __("Incluye la primera. Máximo 104."),
					depends_on: "eval:doc.is_recurring",
				}
			);
		}

		fields.push(
			{ fieldname: "sec_ck", fieldtype: "Section Break", label: __("Subtareas") },
			{ fieldname: "checklist_html", fieldtype: "HTML" },
			{ fieldname: "sec_part", fieldtype: "Section Break", label: __("Participantes") },
			{ fieldname: "participants_html", fieldtype: "HTML" },
			{ fieldname: "sec_com", fieldtype: "Section Break", label: __("Comentarios") },
			{ fieldname: "comments_html", fieldtype: "HTML" }
		);

		// Extra tab (next to Comentarios) listing every activity of the same recurring
		// series — past and future — so they can be consulted / opened from here.
		if (activity && activity.recurrence_group) {
			fields.push(
				{ fieldname: "sec_recur_linked", fieldtype: "Section Break", label: __("Serie recurrente") },
				{ fieldname: "recur_linked_html", fieldtype: "HTML" }
			);
		}

		const dialog_opts = {
			title: activity ? (view_only ? __("Ver actividad") : __("Editar actividad")) : __("Nueva actividad"),
			size: "large",
			fields,
		};

		if (!view_only) {
			dialog_opts.primary_action_label = activity ? __("Guardar") : __("Crear");
			dialog_opts.primary_action = (values) => {
				if (d._em_submitting) return;

				if (values.start_date && values.due_date && values.start_date > values.due_date) {
					frappe.msgprint(__("La fecha de inicio no puede ser posterior a la fecha límite."));
					return;
				}
				if (can_set_recurrence && values.is_recurring) {
					if (!values.due_date) {
						frappe.msgprint(
							__("Una actividad recurrente necesita una fecha límite: es la primera ocurrencia de la serie.")
						);
						return;
					}
					if (!values.recurrence_end_date && !values.recurrence_count) {
						frappe.msgprint(
							__("Indica hasta qué fecha se repite ('Repetir hasta') o cuántas veces ('Número de repeticiones').")
						);
						return;
					}
				}

				d._em_submitting = true;
				d.disable_primary_action();

				const release = () => {
					d._em_submitting = false;
					d.enable_primary_action();
				};

				const submit = () => {
					const payload = {
						title: values.title,
						task_type: values.task_type,
						description: values.description,
						is_important: values.is_important ? 1 : 0,
						is_urgent: values.is_urgent ? 1 : 0,
						status: values.status,
						due_date: values.due_date,
						start_date: values.start_date || null,
						project: values.project || null,
						tags: (values.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
						start_time: values.start_time || null,
						end_time: values.end_time || null,
						logged_hours: values.logged_hours || 0,
						is_billable: values.is_billable ? 1 : 0,
					};
					if (has_google_sync) {
						payload.sync_to_google = values.sync_to_google ? 1 : 0;
					}
					if (!activity && init.follow_up_of) {
						payload.follow_up_of = init.follow_up_of;
					}
					if (!activity && init.template) {
						payload.template = init.template;
					}
					if (can_set_recurrence && values.is_recurring) {
						payload.is_recurring = 1;
						payload.recurrence_frequency = values.recurrence_frequency || "Semanal";
						payload.recurrence_end_date = values.recurrence_end_date || null;
						payload.recurrence_count = values.recurrence_count || null;
					}
					const call = activity
						? this._call("eisenhower_matrix.api.activity.update_activity", { name: activity.name, payload: JSON.stringify(payload) })
						: this._call("eisenhower_matrix.api.activity.create_activity", { payload: JSON.stringify(payload) });
					call
						.then((result) => {
							d.hide();
							if (!activity && result) {
								this._flash_activity(result);
								this.refresh().then(() => this._scroll_to_card(result));
							} else if (result && result.modified) {
								this._notify_activity_updated(result.name);
								this._flash_activity(result.name);
								this.refresh().then(() => this._scroll_to_card(result.name));
							} else {
								this.refresh();
							}
						})
						.catch(release);
				};

				// Double-booking guard: if the user already has an activity that day whose
				// time overlaps this one, ask before saving. A failure of the check itself
				// never blocks the save.
				if (values.due_date && values.start_time) {
					this._call("eisenhower_matrix.api.activity.check_time_conflicts", {
						due_date: values.due_date,
						start_time: values.start_time,
						end_time: values.end_time || null,
						exclude: activity ? activity.name : null,
					})
						.then((conflicts) => {
							if (conflicts && conflicts.length) {
								const list = conflicts
									.map((c) => `• ${frappe.utils.escape_html(c.title)} (${c.time_label})`)
									.join("<br>");
								frappe.confirm(
									`${__("Ya tienes {0} actividad(es) programada(s) el {1} en ese horario:", [
										conflicts.length,
										frappe.datetime.str_to_user(values.due_date),
									])}<br>${list}<br><br>${__("¿Deseas programarla de todas formas (sobreponer)?")}`,
									submit,
									release
								);
							} else {
								submit();
							}
						})
						.catch(submit);
				} else {
					submit();
				}
			};
		}

		d = new frappe.ui.Dialog(dialog_opts);
		d.$wrapper.addClass("em-activity-dialog");

		if (activity) {
			this._render_meta(d, activity);
			this._render_checklist(d, activity, !view_only && !EM_CLOSED_STATUSES.includes(activity.status));
			this._render_participants(d, activity);
			this._render_comments(d, activity);
			if (activity.recurrence_group) this._render_linked_recurrences(d, activity);

			if (!view_only) {
				d.add_custom_action(
					__("Vincular para seguimiento"),
					() => {
						this._call("eisenhower_matrix.api.activity.get_follow_up_defaults", { name: activity.name }).then(
							(defaults) => {
								d.hide();
								this.open_activity_dialog(null, defaults);
							}
						);
					}
				);
			}
			d.add_custom_action(__("Guardar como plantilla"), () => {
				frappe.prompt(
					[{ fieldname: "template_name", fieldtype: "Data", label: __("Nombre de la plantilla"), reqd: 1, default: activity.title }],
					(v) =>
						this._call("eisenhower_matrix.api.extras.save_as_template", { activity: activity.name, template_name: v.template_name }).then(() => {
							frappe.show_alert({ message: __("Plantilla guardada"), indicator: "green" });
							this.refresh();
						}),
					__("Guardar como plantilla"),
					__("Guardar")
				);
			});
			if (activity.owner === frappe.session.user) {
				d.add_custom_action(
					__("Duplicar actividad"),
					() => {
						this._call("eisenhower_matrix.api.activity.duplicate_activity", { name: activity.name }).then(
							(new_name) => {
								d.hide();
								this.refresh().then(() => this.open_activity_dialog(new_name));
							}
						);
					}
				);
			}
		} else {
			d.fields_dict.checklist_html.$wrapper.html('<div class="em-empty">Guarda la actividad para añadir subtareas.</div>');
			d.fields_dict.participants_html.$wrapper.html(
				'<div class="em-empty">Guarda la actividad para poder compartirla o delegarla.</div>'
			);
			d.fields_dict.comments_html.$wrapper.html('<div class="em-empty">Guarda la actividad para comentar.</div>');
		}

		this._wire_dialog_tabs(d);
		if (activity) this._render_checklist(d, activity, !view_only && !EM_CLOSED_STATUSES.includes(activity.status));
		d.show();
		// Deferred so any default-population change events (Frappe fires df.change on
		// set_value regardless of whether it was user- or default-driven) settle first —
		// only genuine user edits after this point should trigger the end-time suggestion.
		setTimeout(() => {
			dialog_ready = true;
		}, 0);
	}

	_render_meta(d, activity) {
		const created_line = `${__("Creada por")} ${frappe.utils.escape_html(this.user_label(activity.owner))} · ${frappe.datetime.str_to_user(activity.creation)}`;

		const reschedule_html = activity.is_rescheduled
			? `<div class="em-reschedule-badge">🔁 ${__("Reprogramada")} (${activity.reschedule_count})</div>`
			: "";

		const series_count = activity.recurrence_group
			? this.activities.filter((a) => a.recurrence_group === activity.recurrence_group).length
			: 0;
		const recurrence_html = activity.recurrence_group
			? `<div class="em-reschedule-badge">🔄 ${__("Parte de una serie recurrente")}${
					activity.recurrence_frequency ? ` (${activity.recurrence_frequency})` : ""
				} — ${__("{0} actividades", [series_count])}</div>`
			: "";

		let follow_up_html = "";
		if (activity.follow_up_of) {
			const parent = this.activities.find((a) => a.name === activity.follow_up_of);
			if (parent) {
				follow_up_html = `<div class="em-follow-up-banner" data-open-activity="${parent.name}">🔗 ${__("Seguimiento de")} ${frappe.utils.escape_html(parent.title)}</div>`;
			}
		}

		const children = this.activities.filter((a) => a.follow_up_of === activity.name);
		if (children.length) {
			follow_up_html += `
				<div class="em-follow-up-list-title">${__("Tareas de seguimiento vinculadas")} (${children.length})</div>
				${children
					.map(
						(c) =>
							`<div class="em-follow-up-item" data-open-activity="${c.name}">🔗 ${frappe.utils.escape_html(c.title)}</div>`
					)
					.join("")}
			`;
		}

		const $wrap = d.fields_dict.meta_html.$wrapper;
		$wrap.html(`<div class="em-created-line">${created_line}${reschedule_html}</div>${recurrence_html}${follow_up_html}`);
		$wrap.on("click", "[data-open-activity]", (e) => {
			const name = $(e.currentTarget).attr("data-open-activity");
			d.hide();
			this.open_activity_dialog(name);
		});
	}

	// Manual tab bar built on the plain, long-standing ".form-section" class + DOM
	// traversal (no dependency on Dialog's internal tab machinery).
	_wire_dialog_tabs(d) {
		const $sections = $(d.body).find(".form-section");
		if (!$sections.length) return;

		const idx_of = (fd) => (fd ? $sections.index(fd.$wrapper.closest(".form-section")) : -1);
		const checklist_idx = idx_of(d.fields_dict.checklist_html);
		const participants_idx = idx_of(d.fields_dict.participants_html);
		const comments_idx = idx_of(d.fields_dict.comments_html);
		const linked_idx = idx_of(d.fields_dict.recur_linked_html);

		const groups = { detalle: [], subtareas: [], participantes: [], comentarios: [], vinculadas: [] };
		$sections.each((i, el) => {
			if (i === checklist_idx) groups.subtareas.push(el);
			else if (i === participants_idx) groups.participantes.push(el);
			else if (i === comments_idx) groups.comentarios.push(el);
			else if (linked_idx >= 0 && i === linked_idx) groups.vinculadas.push(el);
			else groups.detalle.push(el);
		});

		const tabs = [
			{ key: "detalle", label: __("Detalle") },
			{ key: "subtareas", label: `${__("Subtareas")} <span class="em-tab-count"></span>` },
			{ key: "participantes", label: __("Participantes") },
			{ key: "comentarios", label: __("Comentarios") },
		];
		if (linked_idx >= 0) tabs.push({ key: "vinculadas", label: __("Recurrentes") });
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

	// "Recurrentes" tab: every activity of the same series (past + future), each row
	// opens that activity; the owner also gets a "Detener recurrencia" action that
	// deletes the future occurrences and unlinks the rest.
	_render_linked_recurrences(d, activity) {
		const $wrap = d.fields_dict.recur_linked_html.$wrapper;
		const group = activity.recurrence_group;
		const today = frappe.datetime.get_today();
		const is_owner = activity.owner === frappe.session.user;

		const members = this.activities
			.filter((a) => a.recurrence_group === group)
			.sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));

		const WHEN_LABEL = { pasada: __("pasada"), hoy: __("hoy"), futura: __("futura"), sin: __("sin fecha") };
		const rows = members
			.map((m) => {
				const is_this = m.name === activity.name;
				const when = !m.due_date ? "sin" : m.due_date < today ? "pasada" : m.due_date === today ? "hoy" : "futura";
				return `
					<div class="em-linked-row em-linked-${when}${is_this ? " em-linked-current" : ""}" ${
						is_this ? "" : `data-open-activity="${m.name}"`
					}>
						<span class="em-linked-date">${m.due_date ? frappe.datetime.str_to_user(m.due_date) : "—"}</span>
						<span class="em-linked-when">${WHEN_LABEL[when]}</span>
						<span>${frappe.utils.escape_html(m.status)}</span>
						${is_this ? `<span class="em-linked-thisone">${__("(esta)")}</span>` : ""}
					</div>`;
			})
			.join("");

		const future_count = members.filter(
			(m) => m.name !== activity.name && m.due_date && m.due_date > today
		).length;
		const stop_btn =
			is_owner && members.length > 1
				? `<button type="button" class="btn btn-xs btn-danger em-stop-recurrence">${__(
						"Detener recurrencia y eliminar próximas ({0})",
						[future_count]
					)}</button>`
				: "";

		const freq = activity.recurrence_frequency ? ` · ${frappe.utils.escape_html(activity.recurrence_frequency)}` : "";
		$wrap.html(`
			<div class="em-linked-head">🔄 ${__("Serie recurrente")}${freq} · ${__("{0} actividades", [members.length])}</div>
			<div class="em-linked-list">${rows}</div>
			${stop_btn}
			${
				stop_btn
					? `<div class="em-empty">${__(
							"Se eliminan sólo las ocurrencias con fecha futura; las de hoy y anteriores se conservan como actividades sueltas."
						)}</div>`
					: ""
			}
		`);

		$wrap.off("click").on("click", "[data-open-activity]", (e) => {
			d.hide();
			this.open_activity_dialog($(e.currentTarget).attr("data-open-activity"));
		});
		$wrap.find(".em-stop-recurrence").on("click", () => {
			frappe.confirm(
				__(
					"¿Detener esta serie recurrente? Se eliminarán {0} ocurrencia(s) futura(s) y las actividades restantes dejarán de estar vinculadas.",
					[future_count]
				),
				() => {
					this._call("eisenhower_matrix.api.activity.stop_recurrence", { activity: activity.name }).then(() => {
						d.hide();
						this.refresh();
					});
				}
			);
		});
	}

	_render_participants(d, activity) {
		const $wrap = d.fields_dict.participants_html.$wrapper;
		const is_owner = activity.owner === frappe.session.user;
		const has_google_sync = this.settings && this.settings.has_google_sync;

		const rows = (activity.participants || [])
			.map((p) => {
				const is_external = p.invite_role === "Externo";
				const is_delegate = p.invite_role === "Delegado";
				const label = is_external ? p.external_email : p.user;
				const badge_class = is_external
					? "em-badge-external"
					: is_delegate
						? "em-badge-delegated"
						: p.status === "Aceptada"
							? "em-badge-accepted"
							: p.status === "Rechazada"
								? "em-badge-rejected"
								: "em-badge-pending";
				const badge_text = is_external
					? __("Externo · Google Calendar")
					: is_delegate
						? `${__("Delegado")} · ${p.status}`
						: p.status;
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
						<option value="Delegado">${__("Delegado (asignar la tarea)")}</option>
						${has_google_sync ? `<option value="Externo">${__("Externo (invitado por correo)")}</option>` : ""}
					</select>
					<span class="em-invite-user-picker"></span>
					<input type="email" class="form-control em-invite-email" placeholder="correo@ejemplo.com" style="display:none">
					<label class="em-invite-transfer" style="display:none">
						<input type="checkbox" class="em-invite-transfer-cb">
						${__("Transferir responsabilidad al aceptar")}
					</label>
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
				$wrap.find(".em-invite-user-picker").toggle(type === "Colaborador" || type === "Delegado");
				$wrap.find(".em-invite-email").toggle(type === "Externo");
				$wrap.find(".em-invite-transfer").toggle(type === "Delegado");
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
				} else if (type === "Delegado") {
					const user = user_control.get_value();
					if (!user) return;
					const transfer_ownership = $wrap.find(".em-invite-transfer-cb").is(":checked") ? 1 : 0;
					participant = { invite_role: "Delegado", user, transfer_ownership };
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
							.map((c) => {
								const is_info = c.comment_type === "Info";
								return `
						<div class="em-comment${is_info ? " em-comment-info" : ""}">
							<div class="em-c-meta">${is_info ? "🕓 " : ""}${frappe.utils.escape_html(c.comment_by)} · ${frappe.datetime.comment_when(c.creation)}</div>
							<div class="em-c-content">${c.content}</div>
						</div>
					`;
							})
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

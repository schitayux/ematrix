// Copyright (c) 2026, CHAPPSA and contributors
// For license information, please see license.txt

frappe.ui.form.on("Configuraciones EMatrix", {
	setup(frm) {
		frm.set_query("google_calendar", () => ({
			filters: { user: frm.doc.user, enable: 1 },
		}));
	},

	refresh(frm) {
		if (!frm.is_new() && frm.doc.sync_enabled) {
			frm.add_custom_button(__("Sincronizar ahora"), () => {
				frappe.call({
					method: "eisenhower_matrix.google_sync.trigger_sync",
					args: { config: frm.doc.name },
					freeze: true,
					freeze_message: __("Sincronizando con Google Calendar..."),
					callback: () => frm.reload_doc(),
				});
			});
		}
	},
});

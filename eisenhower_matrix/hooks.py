app_name = "eisenhower_matrix"
app_title = "Eisenhower Matrix"
app_publisher = "CHAPPSA"
app_description = "Matriz de Eisenhower colaborativa: actividades personales, delegacion con aceptar/rechazar, comentarios y multiples vistas (Cuadrante, Kanban, Lista, Tarjetas)"
app_email = "chitayux@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "eisenhower_matrix",
# 		"logo": "/assets/eisenhower_matrix/logo.png",
# 		"title": "Eisenhower Matrix",
# 		"route": "/eisenhower_matrix",
# 		"has_permission": "eisenhower_matrix.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/eisenhower_matrix/css/eisenhower_matrix.css"
# app_include_js = "/assets/eisenhower_matrix/js/eisenhower_matrix.js"

# include js, css files in header of web template
# web_include_css = "/assets/eisenhower_matrix/css/eisenhower_matrix.css"
# web_include_js = "/assets/eisenhower_matrix/js/eisenhower_matrix.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "eisenhower_matrix/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
app_include_icons = "eisenhower_matrix/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "eisenhower_matrix.utils.jinja_methods",
# 	"filters": "eisenhower_matrix.utils.jinja_filters"
# }

# Installation
# ------------

after_install = "eisenhower_matrix.install.after_install"
after_migrate = "eisenhower_matrix.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "eisenhower_matrix.uninstall.before_uninstall"
# after_uninstall = "eisenhower_matrix.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "eisenhower_matrix.utils.before_app_install"
# after_app_install = "eisenhower_matrix.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "eisenhower_matrix.utils.before_app_uninstall"
# after_app_uninstall = "eisenhower_matrix.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "eisenhower_matrix.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# Privacidad: nadie (ni System Manager) ve actividades ajenas salvo por las reglas de
# la app (dueño, responsable, participante). Ver eisenhower_matrix/permissions.py.
permission_query_conditions = {
	"EU Activity": "eisenhower_matrix.permissions.activity_query_conditions",
	"EU Activity Event": "eisenhower_matrix.permissions.event_query_conditions",
	"EU Activity Template": "eisenhower_matrix.permissions.template_query_conditions",
	"Comment": "eisenhower_matrix.permissions.comment_query_conditions",
	"Version": "eisenhower_matrix.permissions.version_query_conditions",
	"ToDo": "eisenhower_matrix.permissions.todo_query_conditions",
}

has_permission = {
	"EU Activity": "eisenhower_matrix.permissions.activity_has_permission",
	"EU Activity Event": "eisenhower_matrix.permissions.event_has_permission",
	"EU Activity Template": "eisenhower_matrix.permissions.template_has_permission",
	"Comment": "eisenhower_matrix.permissions.comment_has_permission",
	"Version": "eisenhower_matrix.permissions.version_has_permission",
	"ToDo": "eisenhower_matrix.permissions.todo_has_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"EU Activity": {
		# on_update also fires for brand-new documents (right after after_insert, in the
		# same save), so wiring after_insert here too would enqueue two push jobs per
		# creation and race each other into inserting duplicate Google events.
		"on_update": "eisenhower_matrix.google_sync.on_activity_change",
		"on_trash": [
			"eisenhower_matrix.google_sync.on_activity_trash",
			# Strips back-links (EU Activity Event rows, follow_up_of children) before
			# Frappe's link check runs, so recurring-series and completed activities can
			# actually be deleted.
			"eisenhower_matrix.recurrence.on_activity_trash",
		],
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"hourly": [
		"eisenhower_matrix.google_sync.sync_all",
	],
	"cron": {
		# Resumen matutino de Mi día (hora del sistema configurada en System Settings).
		"0 7 * * *": [
			"eisenhower_matrix.api.extras.send_daily_digest",
		],
	},
}

# Testing
# -------

# before_tests = "eisenhower_matrix.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "eisenhower_matrix.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "eisenhower_matrix.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["eisenhower_matrix.utils.before_request"]
# after_request = ["eisenhower_matrix.utils.after_request"]

# Job Events
# ----------
# before_job = ["eisenhower_matrix.utils.before_job"]
# after_job = ["eisenhower_matrix.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"eisenhower_matrix.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }


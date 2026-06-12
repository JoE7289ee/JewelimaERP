app_name = "jewelima"
app_title = "Jewelima"
app_publisher = "Joseph Daison"
app_description = "Jewelry Manufacturing Management System"
app_email = "joedai555@gmail.com"
app_license = "mit"
app_logo_url = "/assets/jewelima/images/jewelima-diamond.svg"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "jewelima",
		"logo": "/assets/jewelima/images/jewelima-diamond.svg",
		"title": "Jewelima",
		"route": "/app/jewelima",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/jewelima/css/jewelima.css"
# app_include_js = "/assets/jewelima/js/jewelima.js"

# include js, css files in header of web template
# web_include_css = "/assets/jewelima/css/jewelima.css"
# web_include_js = "/assets/jewelima/js/jewelima.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "jewelima/public/scss/website"

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
# app_include_icons = "jewelima/public/icons.svg"

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

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "jewelima.utils.jinja_methods",
# 	"filters": "jewelima.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "jewelima.install.before_install"
after_install = "jewelima.setup.after_install"
after_migrate = "jewelima.setup.after_migrate"

# Uninstallation
# ------------

# before_uninstall = "jewelima.uninstall.before_uninstall"
# after_uninstall = "jewelima.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "jewelima.utils.before_app_install"
# after_app_install = "jewelima.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "jewelima.utils.before_app_uninstall"
# after_app_uninstall = "jewelima.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "jewelima.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "jewelima.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

JOB_ORDER = "jewelima.jewelima.doctype.job_order.job_order"

STAGE_DOCTYPES = [
	"CAD", "CAM", "Tree Making", "Casting", "Grinding", "Filing",
	"Setting", "Pre Polish", "Wax Setting", "Final Polish", "Wax Cleaning", "Bag Extraction",
]

# Every stage doctype: lock once completed + (for CAD) the Item/BOM restriction,
# then start the next stage in the sequence when one is completed.
doc_events = {
	dt: {
		"validate": f"{JOB_ORDER}.validate_stage",
		"on_update": f"{JOB_ORDER}.on_stage_completed",
	}
	for dt in STAGE_DOCTYPES
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"jewelima.tasks.all"
# 	],
# 	"daily": [
# 		"jewelima.tasks.daily"
# 	],
# 	"hourly": [
# 		"jewelima.tasks.hourly"
# 	],
# 	"weekly": [
# 		"jewelima.tasks.weekly"
# 	],
# 	"monthly": [
# 		"jewelima.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "jewelima.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "jewelima.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "jewelima.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "jewelima.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["jewelima.utils.before_request"]
# after_request = ["jewelima.utils.after_request"]

# Job Events
# ----------
# before_job = ["jewelima.utils.before_job"]
# after_job = ["jewelima.utils.after_job"]

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
# 	"jewelima.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []


const adminAuthRoute = require("./adminAuth.route");
const userRoute = require("./user.route");
const settingsRoute = require("./settings.route");
const dashboardRoute = require("./dashboard.route");

const adminRoutes = [
	{
		path: "/admin/auth/",
		route: adminAuthRoute,
	},
	{
		path: "/admin/user/",
		route: userRoute,
	},
	{
		path: "/admin/settings/",
		route: settingsRoute,
	},
	{
		path: "/admin/dashboard/",
		route: dashboardRoute,
	},
];

module.exports = adminRoutes;

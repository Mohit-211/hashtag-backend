const adminAuthRoute = require("./adminAuth.route");
const userRoute = require("./user.route");
const settingsRoute = require("./settings.route");

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
];

module.exports = adminRoutes;

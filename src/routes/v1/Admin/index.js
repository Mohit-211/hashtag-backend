const adminAuthRoute = require("./adminAuth.route");
const userRoute = require("./user.route");

const adminRoutes = [
	{
		path: "/admin/auth/",
		route: adminAuthRoute,
	},
	{
		path: "/admin/user/",
		route: userRoute,
	},
];

module.exports = adminRoutes;

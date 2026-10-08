const userAuthRoute = require('./auth.route');
const userOpRoute = require('./user.route');

const customerRoutes = [
    {
        path: '/user/auth/',
        route: userAuthRoute,
    },
    {
        path: '/user/',
        route: userOpRoute,
    }
];

module.exports = customerRoutes;
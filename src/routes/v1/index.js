const express = require('express');
const router = express.Router();

const commonRoutes = require('./Common');
const adminRoutes = require('./Admin');
const userAuthRoutes = require('./User');


const defaultRoutes = [
    ...commonRoutes,
    ...adminRoutes,
    ...userAuthRoutes,
];


defaultRoutes.forEach((route) => {
    router.use(route.path, route.route);
});

module.exports = router;
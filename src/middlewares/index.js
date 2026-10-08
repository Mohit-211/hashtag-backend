const adminAuthMiddleware = require('./adminAuth.middleware');
const roleMiddleware = require('./role.middleware');
const userAuthMiddleware = require('./userAuth.middleware');


module.exports = {
    adminAuthMiddleware,
    roleMiddleware,
    userAuthMiddleware,
}

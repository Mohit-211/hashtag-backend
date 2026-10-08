const adminService = require('./Admin');
const commonService = require('./Common');
const userService = require('./User');

module.exports = {
    ...adminService,
    ...commonService,
    ...userService,
}

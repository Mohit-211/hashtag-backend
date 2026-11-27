const adminAuthService = require('./adminAuth.service');
const userService = require("./user.service");
const userImportService = require("./userImport.service");
const settingsService = require("./settings.service");
const dashboardService = require("./dashboard.service");


module.exports = {
    adminAuthService,
    userService,
    userImportService,
    settingsService,
    dashboardService,
};
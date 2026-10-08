const config = require('../config/config');
const allowedOrigins = config.accessDomains.split(',');
module.exports = allowedOrigins;
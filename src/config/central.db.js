const { Sequelize } = require('sequelize');
const config = require('./config.js');
const logger = require('./logger.js');

// supportBigNumbers and collate used to sit here, where Sequelize ignores them; they
// were never in effect, so they were dropped rather than turned on.
const sequelizeOptions = {
    host: config.databases.central.host,
    port: Number(config.databases.central.port) || 3306,
    dialect: 'mysql',
    pool: {
        max: 10,
        min: 0,
        idle: 10000,
    },
    logging: config.env === 'production' ? false : console.log
};

//create connection object
const sequelize = new Sequelize(
    config.databases.central.db,
    config.databases.central.user,
    config.databases.central.passwd,
    sequelizeOptions,
);

sequelize.authenticate()
    .then(() => logger.info('Primary Database Connection has been established successfully😊.'))
    .catch((error) => logger.warn('Unable to connect to the Primary Database🥺 :', error));


module.exports = sequelize;

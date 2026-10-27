// The timezone must be set before anything else loads: models and cron jobs read it at load time.
const config = require('./src/config/config.js');
process.env.TZ = config.DEFAULT_TIMEZONE;

const moment = require('moment');
const logger = require('./src/config/logger.js');
const sequelize = require('./src/config/central.db.js');
const settings = require('./src/config/settings.js');

let server = null;

// Settings (the admin panel's Settings page, or .env until they've moved there) are loaded
// before the app, so no request or cron job runs without them.
const start = async () => {
  await settings.load();
  settings.startRefresh();
  settings.report();

  const app = require('./app.js');
  const { verifyTransport } = require('./src/services/Common/email.service.js');
  if (config.env !== 'test') verifyTransport();

  server = app.listen(config.port, () => {
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    logger.info(`Server running on port ${config.port} | Time: ${currentTime}`);
  });
};

// Stops accepting connections, lets requests in flight finish, then closes the database pool.
let shuttingDown = false;
const shutdown = (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason}: shutting down.`);

  // Don't wait forever on a connection that never closes.
  setTimeout(() => process.exit(exitCode), 10000).unref();

  if (!server) {
    process.exit(exitCode);
    return;
  }

  server.close(async () => {
    try {
      await sequelize.close();
    } catch (error) {
      logger.error(`Closing the database failed: ${error.message}`);
    }
    process.exit(exitCode);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A promise rejected with no handler is a bug, but not a reason to take the site down.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason?.stack || reason}`);
});

// After an uncaught exception the process state is unknown: log it and exit (PM2 restarts the app).
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error?.stack || error}`);
  shutdown('Uncaught exception', 1);
});

start().catch((error) => {
  logger.error(`Start failed: ${error?.stack || error}`);
  process.exit(1);
});

const app = require('./app.js');
const moment = require('moment');
const config = require('./src/config/config.js');
const logger = require('./src/config/logger.js');

process.env.TZ = config.DEFAULT_TIMEZONE;

const server = app.listen(config.port, () => {
  const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
  logger.info(`Server running on port ${config.port} | Time: ${currentTime}`);
});

// graceful shutdown
const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM received.');
  exitHandler();
});

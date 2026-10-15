
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('./config.js');
const { dirs } = require('./storage.js');

const enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.stack });
    }
    return info;
});

// Console output (what pm2 logs shows), plus files in the log folder outside tests:
//   app.log   everything at info level and above
//   error.log errors only
// Each file rolls over at 10 MB and the newest 10 are kept.
const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            config.env === 'development' ? winston.format.colorize() : winston.format.uncolorize(),
            winston.format.printf(({ level, message }) => `${level}: ${message}`)
        ),
        stderrLevels: ['error'],
    }),
];

if (config.env !== 'test') {
    fs.mkdirSync(dirs.logs, { recursive: true });

    const fileFormat = winston.format.combine(
        winston.format.uncolorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
    );
    const rolling = { maxsize: 10 * 1024 * 1024, maxFiles: 10, tailable: true, format: fileFormat };

    transports.push(
        new winston.transports.File({ filename: path.join(dirs.logs, 'app.log'), level: 'info', ...rolling }),
        new winston.transports.File({ filename: path.join(dirs.logs, 'error.log'), level: 'error', ...rolling })
    );
}

const logger = winston.createLogger({
    level: config.env === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        enumerateErrorFormat(),
        winston.format.splat()
    ),
    transports,
});

module.exports = logger;

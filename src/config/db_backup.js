const { exec } = require('child_process');
const config = require('./config')

const backupPath = '../../db_backup';
const databaseConfig = {
    host: config.databases.central.host,
    user: config.databases.central.user,
    password: config.databases.central.passwd,
    database: config.databases.central.db,
};

exec(`mysqldump --host=${databaseConfig.host} --user=${databaseConfig.user} --password=${databaseConfig.password} ${databaseConfig.database} > ${backupPath}`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Backup failed: ${error}`);
    } else {
        console.log('Backup created successfully.');
    }
});

const sequelize = require("./central.db");
const initialSeedData = require('../seeders/execution');
require('../models');

const init = async () => {

    /* Migrate only Table */
    sequelize
        .sync({ alter: true })
        .then(async (result) => console.log('Altering Table Completed ⚡.'))
        .catch((err) => console.log('Failed to alter all table into database: 🚩 ', err));


    /* Migrate Table and Create Initial Data */
    // sequelize
    //     .sync({ alter: true })
    //     .then(async (result) => {
    //         console.log('Altering Table Completed ⚡.');
    //         await initialSeedData(sequelize);
    //     })
    //     .catch((err) => console.log('Failed to alter all table into database: 🚩 ', err));

};

// For Table migration
init();
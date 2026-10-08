const adminController = require('./Admin');
const commonController = require('./Common');
const userController = require('./User');


module.exports = {
    ...adminController,
    ...commonController,
    ...userController,
}
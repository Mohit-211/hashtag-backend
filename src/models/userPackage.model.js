const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class UserPackage extends Model {}

UserPackage.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: DataTypes.INTEGER,
    package_id: DataTypes.INTEGER,
    purchase_date: DataTypes.DATE,
    expiry_date: DataTypes.DATE,
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    sequelize,
    tableName: 'user_packages',
    timestamps: true,
    underscored: true
});

module.exports = UserPackage;

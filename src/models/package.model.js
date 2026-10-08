const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class Package extends Model {}

Package.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: DataTypes.STRING(100),
    price: DataTypes.FLOAT,
    currency: {
        type: DataTypes.STRING(10),
        defaultValue: 'CAD'
    },
    allow_stream: DataTypes.BOOLEAN,
    allow_download: DataTypes.BOOLEAN,
    allow_group: DataTypes.BOOLEAN,
    duration_hours: DataTypes.INTEGER,
    duration_days: DataTypes.INTEGER,
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    deleted_at: DataTypes.DATE
}, {
    sequelize,
    tableName: 'packages',
    timestamps: true,
    paranoid: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

module.exports = Package;

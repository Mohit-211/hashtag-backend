const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class Timezone extends Model { }
Timezone.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    time_zone: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    current_local_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    current_utc_offset: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    standard_utc_offset: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    has_day_light_saving: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    is_day_light_saving_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    sequelize,
    tableName: 'timezones',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

Timezone.beforeUpdate(async (Timezone) => {
    Timezone.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});
Timezone.beforeDestroy(async (Timezone) => {
    Timezone.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    Timezone.is_active = false;
});

module.exports = Timezone;

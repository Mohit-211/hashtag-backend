const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class City extends Model { }
City.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        collate: 'utf8mb4_unicode_ci',
    },
    country_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        onDelete:'RESTRICT',
        onUpdate: 'CASCADE',
        references: {
            model: 'countries',
            key: 'id',
        },
    },
    country_code: {
        type: DataTypes.CHAR(2),
        allowNull: false,
        collate: 'utf8mb4_unicode_ci',
    },
    state_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        onDelete:'SET NULL',
        onUpdate: 'CASCADE',
        references: {
            model: 'states',
            key: 'id',
        },
    },
    state_code: {
        type: DataTypes.STRING(255),
        allowNull: false,
        collate: 'utf8mb4_unicode_ci',
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
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
    tableName: 'cities',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

City.beforeUpdate(async (city) => {
    city.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});
City.beforeDestroy(async (city) => {
    city.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    city.is_active = false;
});

module.exports = City;

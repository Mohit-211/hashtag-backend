const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class State extends Model { }
State.init({
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
        }
    },
    country_code: {
        type: DataTypes.CHAR(2),
        allowNull: false,
        collate: 'utf8mb4_unicode_ci',
    },
    fips_code: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    iso2: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    type: {
        type: DataTypes.STRING(191),
        collate: 'utf8mb4_unicode_ci',
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
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
    flag: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    wikiDataId: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
        comment: 'Rapid API GeoDB Cities',
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
    tableName: 'states',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

State.beforeUpdate(async (state) => {
    state.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});
State.beforeDestroy(async (state) => {
    state.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    state.is_active = false;
});

module.exports = State;

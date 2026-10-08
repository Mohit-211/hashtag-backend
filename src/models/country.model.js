const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class Country extends Model { }
Country.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        collate: 'utf8mb4_unicode_ci',
    },
    iso3: {
        type: DataTypes.CHAR(3),
        collate: 'utf8mb4_unicode_ci',
    },
    numeric_code: {
        type: DataTypes.CHAR(3),
        collate: 'utf8mb4_unicode_ci',
    },
    iso2: {
        type: DataTypes.CHAR(2),
        collate: 'utf8mb4_unicode_ci',
    },
    phonecode: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    capital: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    currency: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    currency_name: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    currency_symbol: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    tld: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    native: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    region: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    subregion: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
    },
    timezones: {
        type: DataTypes.TEXT,
        collate: 'utf8mb4_unicode_ci',
    },
    translations: {
        type: DataTypes.TEXT,
        collate: 'utf8mb4_unicode_ci',
    },
    latitude: {
        type: DataTypes.DECIMAL(11, 8),
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
    },
    emoji: {
        type: DataTypes.STRING(191),
        collate: 'utf8mb4_unicode_ci',
    },
    emojiU: {
        type: DataTypes.STRING(191),
        collate: 'utf8mb4_unicode_ci',
    },
    flag: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    wikiDataId: {
        type: DataTypes.STRING(255),
        collate: 'utf8mb4_unicode_ci',
        comment: 'Rapid API GeoDB Cities',
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP")
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
    created_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
}, {
    sequelize,
    tableName: 'countries',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

Country.beforeUpdate(async (country) => {
    country.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});
Country.beforeDestroy(async (country) => {
    country.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    country.is_active = false;
});

module.exports = Country;
const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');
const slugify = require('slugify');

class Category extends Model { };
Category.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING(200),
            allowNull: false,
        },
        slug: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
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
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'categories',
        timestamps: true,
        underscored: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    }
);

Category.beforeValidate((category) => {
    if (category.title) {
        category.slug = slugify(category.title, { lower: true });
    }
});

Category.beforeUpdate((category) => {
    category.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

Category.beforeDestroy((category) => {
    category.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    category.is_active = false;
});

module.exports = Category;

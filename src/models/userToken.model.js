const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');
const { tokenTypes } = require('../config/types');

class UserToken extends Model { }
UserToken.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        references: {
            model: 'roles',
            key: 'id',
        },
    },
    user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        references: {
            model: 'users',
            key: 'id',
        },
    },
    token_type: {
        type: DataTypes.ENUM,
        values: [ tokenTypes.ACCESS, tokenTypes.FORGOT_PASSWORD, tokenTypes.REFRESH, tokenTypes.RESET_PASSWORD, tokenTypes.SESSION, tokenTypes.VERIFY_EMAIL ],
        defaultValue: tokenTypes.SESSION,
    },
    token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    fcm_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    expired_at: {
        type: DataTypes.DATE,
        allowNull: true
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
    }
}, {
    sequelize,
    tableName: 'user_tokens',
    timestamps: true,
    underscored: true,
    paranoid: true,
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'deletedAt': 'deleted_at'
});

UserToken.beforeUpdate(async (UserToken) => {
    UserToken.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

UserToken.beforeDestroy(async (UserToken) => {
    UserToken.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    UserToken.is_active = false;
});

module.exports = UserToken;

const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class userLoginTiming extends Model { }

userLoginTiming.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        onDelete: 'CASCADE',
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
    login_time_utc: {
        type: DataTypes.DATE,
        allowNull: true
    },
    logout_time_utc: {
        type: DataTypes.DATE,
        allowNull: true
    },
    login_time_local: {
        type: DataTypes.DATE,
        allowNull: true
    },
    logout_time_local: {
        type: DataTypes.DATE,
        allowNull: true
    },
    token_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        onDelete:'SET NULL',
        references: {
            model: 'user_tokens',
            key: 'id',
        },
    },
    time_zone: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'timezones',
            key: 'id',
        },
    },
    ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
    },
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    sequelize,
    tableName: 'user_login_timings',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});


userLoginTiming.beforeUpdate(async (userLoginTiming) => {
    userLoginTiming.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

userLoginTiming.beforeDestroy(async (userLoginTiming) => {
    userLoginTiming.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    userLoginTiming.is_active = false;
});


module.exports = userLoginTiming;
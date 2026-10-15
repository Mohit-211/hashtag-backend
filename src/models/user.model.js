const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');
const { touchUpdatedAt, markDeleted } = require('./hooks');
const { userStatusTypes } = require('../config/types');

class User extends Model { }
User.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    user_name: {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    email: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        onDelete:'RESTRICT',
        onUpdate: 'CASCADE',
        references: {
            model: 'roles',
            key: 'id',
        },
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true
    },
    square_customer_id: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM,
        values: [userStatusTypes.ACCEPTED, userStatusTypes.PENDING, userStatusTypes.REJECTED, userStatusTypes.REVIEWED, userStatusTypes.REVIEWING],
        defaultValue: userStatusTypes.PENDING,
    },
    notification_status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    deleted_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    sequelize,
    tableName: 'users',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    defaultScope: {
        attributes: { exclude: ['password'] },
    },
    scopes: {
        withPassword: {
            attributes: { include: ['password'] },
        },
    },
});

User.afterCreate(async (user) => {
    user.user_name = transformEmail(user.email);
    await user.save();
});

function generateRandomNumber() {
    return Math.floor(10000 + Math.random() * 90000);
};

function transformEmail(email) {
    const username = email.split('@')[0];
    const randomSuffix = generateRandomNumber();
    const result = `${username}${randomSuffix}`;
    return result;
};


User.isEmailTaken = async function (email, role_id) {
    let u = await this.findOne({ where: { email: email, role_id: role_id, is_active: true } });
    return !!u;
};

User.beforeUpdate(touchUpdatedAt);

User.beforeDestroy(markDeleted);

module.exports = User;
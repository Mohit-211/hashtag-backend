const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');
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
    socket_id: {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    fcm_token: {
        type: DataTypes.STRING,
        allowNull: true
    },
    reffral_id: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM,
        values: [userStatusTypes.ACCEPTED, userStatusTypes.PENDING, userStatusTypes.REJECTED, userStatusTypes.REVIEWED, userStatusTypes.REVIEWING],
        defaultValue: userStatusTypes.PENDING,
    },
    remember_token: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    is_proof_verify: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
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
    deletedAt: 'deleted_at'
});

User.afterCreate(async (user) => {
    const socketId = `${user.role_id}-${user.id}-socketId`;
    user.socket_id = socketId;
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

User.isUserNameTaken = async function (user_name, role_id) {
    let u_n = await this.findOne({ where: { user_name: user_name, role_id: role_id, is_active: true } });
    return !!u_n;
};

User.beforeUpdate(async (user) => {
    user.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

User.beforeDestroy(async (user) => {
    user.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    user.is_active = false;
});

module.exports = User;
const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class Video extends Model {}

Video.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    title: DataTypes.STRING(150),
    video_url: DataTypes.TEXT,
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    sequelize,
    tableName: 'videos',
    timestamps: true,
    paranoid: true,
    underscored: true
});

module.exports = Video;

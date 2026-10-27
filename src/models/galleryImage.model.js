const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");

// Gallery photos and captions the team manages in the admin (migration 2026-10-27, Q56).
class GalleryImage extends Model {}
GalleryImage.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    caption: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "gallery_images",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

GalleryImage.beforeUpdate(touchUpdatedAt);
GalleryImage.beforeDestroy(markDeleted);

module.exports = GalleryImage;

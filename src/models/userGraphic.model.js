const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt } = require("./hooks");

// A customer's saved graphics: every file they upload, once per distinct file (migration
// 2026-11-04). See services/Common/graphic.service.js.
class UserGraphic extends Model {}
UserGraphic.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    // The customer's earlier graphic that this one looks the same as, if any.
    same_as_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // First paid order with this graphic. Empty means the graphic is still new.
    first_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // SHA-256 of the file: the same bytes are the same graphic, in any format.
    file_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    // What the picture looks like (utils/graphicPrint.js). Empty for formats that can't be read.
    visual_print: {
      type: DataTypes.BLOB,
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    mime_type: {
      type: DataTypes.STRING(127),
      allowNull: true,
    },
    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    sequelize,
    tableName: "user_graphics",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

UserGraphic.beforeUpdate(touchUpdatedAt);

module.exports = UserGraphic;

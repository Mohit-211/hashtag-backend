const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// Settings managed in the admin panel (migration 2026-10-27). One row per setting that has
// been saved; see src/config/settings.js. Secret values are stored encrypted.
class AppSetting extends Model {}
AppSetting.init(
  {
    key: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_secret: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // admins.id of the last admin who saved it; empty when imported from .env.
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    tableName: "app_settings",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = AppSetting;

/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");

const sequelize = require("../config/central.db");

class CustomizationOptionValue extends Model {}

CustomizationOptionValue.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    customization_option_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    pricing_type: {
      type: DataTypes.ENUM("FIXED", "TIERED", "QUANTITY_BASED"),
      allowNull: false,
      defaultValue: "FIXED",
    },

    fixed_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "customization_option_values",

    timestamps: true,
    underscored: true,

    paranoid: true,

    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = CustomizationOptionValue;

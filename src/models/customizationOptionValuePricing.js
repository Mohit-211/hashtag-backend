/** @format */

const {
  Sequelize,
  DataTypes,
  Model,
} = require("sequelize");

const sequelize = require("../config/central.db");

class CustomizationOptionValuePricing extends Model {}

CustomizationOptionValuePricing.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    customization_option_value_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    min_quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    max_quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    quantity: {
  type: DataTypes.INTEGER.UNSIGNED,
  allowNull: true,
},

    price: {
      type: DataTypes.DECIMAL(12, 2),
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
    tableName: "customization_option_value_pricing",

    timestamps: true,
    underscored: true,

    paranoid: true,

    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

module.exports = CustomizationOptionValuePricing;
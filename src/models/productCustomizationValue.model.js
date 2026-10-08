const { DataTypes } = require("sequelize");
const sequelize = require("../config/central.db");

const ProductCustomizationValue = sequelize.define(
  "ProductCustomizationValue",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    product_customization_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    customization_option_value_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "product_customization_values",
    timestamps: true,
    paranoid: true,
    underscored: true,
  },
);

module.exports = ProductCustomizationValue;
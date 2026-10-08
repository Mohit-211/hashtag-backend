/** @format */

const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class VariantWarehouse extends Model {}

VariantWarehouse.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    variant_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    warehouse_abbr: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },

    external_warehouse_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    dropship: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    returnable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    full_case_only: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    closeout: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "variant_warehouses",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["variant_id", "warehouse_abbr"],
      },
    ],
  }
);

module.exports = VariantWarehouse;
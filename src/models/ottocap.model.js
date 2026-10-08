/** @format */

const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Ottocap extends Model {}

Ottocap.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    sku_no: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    sku_parent: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    brand: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    name: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    color: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    size: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    instock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    ca_stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    tx_stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    ga_stock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: "ottocap",
    timestamps: false,
  },
);

module.exports = Ottocap;
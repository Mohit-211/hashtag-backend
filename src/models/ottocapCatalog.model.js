/** @format */

const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class OttocapCatalog extends Model {}

OttocapCatalog.init(
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

    upc: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    brand: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    description_short: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    plain_description: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },

    material_content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    price_1: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    price_144: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    price_288: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    price_576: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    price_1296: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    image_1: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_2: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_3: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_4: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_5: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_6: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_7: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_8: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_9: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_10: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    image_main: {
      type: DataTypes.TEXT,
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

    type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    weight: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    instock: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "ottocap_catalog",
    timestamps: false,
  }
);

module.exports = OttocapCatalog;
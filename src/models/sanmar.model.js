/** @format */

const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Sanmar extends Model {}

Sanmar.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    UNIQUE_KEY: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    PRODUCT_TITLE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    PRODUCT_DESCRIPTION: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    STYLE: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    AVAILABLE_SIZES: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    BRAND_LOGO_IMAGE: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    THUMBNAIL_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    COLOR_SWATCH_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    PRODUCT_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    SPEC_SHEET: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    PRICE_TEXT: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    SUGGESTED_PRICE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    CATEGORY_NAME: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    SUBCATEGORY_NAME: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    COLOR_NAME: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    COLOR_SQUARE_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    COLOR_PRODUCT_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    COLOR_PRODUCT_IMAGE_THUMBNAIL: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    SIZE: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    QTY: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    PIECE_WEIGHT: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    PIECE_PRICE: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    DOZENS_PRICE: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    CASE_PRICE: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    PRICE_GROUP: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    CASE_SIZE: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    INVENTORY_KEY: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    SIZE_INDEX: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    SANMAR_MAINFRAME_COLOR: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    MILL: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    PRODUCT_STATUS: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    COMPANION_STYLES: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    MSRP: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    MAP_PRICING: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    FRONT_MODEL_IMAGE_URL: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    BACK_MODEL_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    FRONT_FLAT_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    BACK_FLAT_IMAGE: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    PRODUCT_MEASUREMENTS: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    PMS_COLOR: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    GTIN: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    DECORATION_SPEC_SHEET: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "sanmar",
    timestamps: false, // ❗ IMPORTANT (this table doesn't have created_at etc)

    indexes: [
      {
        fields: ["BRAND_LOGO_IMAGE", "STYLE"],
      },
    ],
  },
);

module.exports = Sanmar;
/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const slugify = require("slugify");

class AddOnProduct extends Model {}

AddOnProduct.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },

    image: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    features: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },

    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
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
    tableName: "addon_products",
    timestamps: true,
    underscored: true,

    paranoid: true,

    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

AddOnProduct.beforeValidate((addon) => {
  if (addon.name) {
    addon.slug = slugify(addon.name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
});

AddOnProduct.beforeUpdate((addon) => {
  addon.updated_at = new Date();

  if (addon.name) {
    addon.slug = slugify(addon.name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
});

module.exports = AddOnProduct;
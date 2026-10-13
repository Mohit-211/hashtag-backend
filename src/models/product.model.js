/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");

class Product extends Model {}

Product.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    brand_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    is_brand_manually_assigned: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    external_style_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    external_style_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    supplier_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    supplier_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    supplier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_supplier_sync_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    supplier_last_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    supplier_image_synced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    is_discontinued: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    discontinued_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    supplier_missing_since: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    sync_locked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    sync_locked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    deleted_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "products",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",

    indexes: [
      {
        unique: true,
        fields: ["external_style_id", "supplier"],
      },
    ],
  },
);

Product.beforeUpdate(touchUpdatedAt);

Product.beforeDestroy(markDeleted);

module.exports = Product;

/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class OrderItem extends Model {}

OrderItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    variant_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    sku: DataTypes.STRING(100),

    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // 🔥 NEW (important for profit tracking)
    cost_price: DataTypes.DECIMAL(10, 2),

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    total_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    // 🔥 NEW
    supplier: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    shipment_status: {
      type: DataTypes.ENUM("PENDING", "SHIPPED", "LABEL_CREATED", "CANCELLED"),
      defaultValue: "PENDING",
    },
    customization_config: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    pricing_snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    logo_image: {
      type: DataTypes.STRING,
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

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    deleted_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "order_items",
    paranoid: true,
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = OrderItem;

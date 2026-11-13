/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { paymentStatusTypes, orderStatusTypes } = require("../config/types");

class Order extends Model {}

Order.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    order_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },

    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    address_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    currency: {
      type: DataTypes.STRING(10),
      defaultValue: "USD",
    },

    service_code: {
      type: DataTypes.STRING(100),
    },

    carrier_code: {
      type: DataTypes.STRING(50),
    },

    // The ShipStation carrier of the rate the customer chose.
    carrier_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    shipping_amount: {
      type: DataTypes.DECIMAL(10, 2),
    },
    // The order handling fee (Settings page, Order fees), charged once per order. Taxed with the
    // products, as the old per-line tumbler charge was.
    handling_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    quoted_shipping_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    actual_shipping_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    shipping_profit: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        orderStatusTypes.PENDING,
        orderStatusTypes.PENDING_PAYMENT,

        orderStatusTypes.CONFIRMED,
        orderStatusTypes.SHIPPED,
        orderStatusTypes.DELIVERED,
        orderStatusTypes.CANCELLED,
        orderStatusTypes.FAILED,
      ),
      defaultValue: orderStatusTypes.PENDING,
    },

    payment_status: {
      type: DataTypes.ENUM(
        paymentStatusTypes.PENDING,
        paymentStatusTypes.SUCCESS,
        paymentStatusTypes.REJECTED,
      ),
      defaultValue: paymentStatusTypes.PENDING,
    },

    payment_method: {
      type: DataTypes.STRING(50),
    },
    shipment_status: {
      type: DataTypes.ENUM(
        "PENDING",
        "SUCCESS",
        "FAILED",
        "LABEL_CREATED",
        "CANCELLED",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "RETURNED",
        "EXCEPTION",
      ),
      defaultValue: "PENDING",
    },

    shipment_id: {
      type: DataTypes.STRING(),
      allowNull: true,
    },

    label_id: {
      type: DataTypes.STRING(),
      allowNull: true,
    },

    tracking_number: DataTypes.STRING(100),
    carrier: DataTypes.STRING(100),
    label_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    tracking_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    shipstation_order_id: DataTypes.STRING(100),

    // Set while the label is being bought, so that only one attempt buys it.
    label_claimed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    shipped_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    shipment_error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Something the team must look at, shown on the admin's order page: stock that ran out after
    // payment, or a payment that arrived for a cancelled order.
    attention_note: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // The admin who cancelled it.
    cancelled_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    cancel_reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    subtotal_amount: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },

    tax_rate: {
      type: DataTypes.DOUBLE,
      defaultValue: 8.25,
    },

    tax_amount: {
      type: DataTypes.DOUBLE,
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

    deleted_at: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "orders",
    paranoid: true,
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = Order;

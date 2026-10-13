const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");
const {
  paymentStatusTypes,
  paymentModeTypes,
  currancyTypes,
} = require("../config/types");
const config = require("../config/config");

class Payment extends Model {}
Payment.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currency: {
      type: DataTypes.ENUM,
      values: [
        currancyTypes.CHF,
        currancyTypes.EUR,
        currancyTypes.INR,
        currancyTypes.KYD,
        currancyTypes.OMR,
        currancyTypes.USD,
      ],
      defaultValue: currancyTypes.USD,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: config.DEFAULT_AMOUNT,
    },
    payment_provider: {
      type: DataTypes.ENUM("SQUARE", "PAYPAL"),
      allowNull: false,
      defaultValue: "SQUARE",
    },
    square_customer_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Description Not Available.",
    },
    payment_status: {
      type: DataTypes.ENUM(
        paymentStatusTypes.PENDING,
        paymentStatusTypes.SUCCESS,
        paymentStatusTypes.REJECTED,
      ),
      allowNull: false,
      defaultValue: paymentStatusTypes.PENDING,
    },
  payment_mode: {
  type: DataTypes.ENUM(
    paymentModeTypes.BANK_ACCOUNT,
    paymentModeTypes.DEBIT_CARD,
    paymentModeTypes.CREDIT_CARD,
    paymentModeTypes.GOOGLE_PAY,
    paymentModeTypes.APPLE_PAY,
    paymentModeTypes.UNKNOWN,
    paymentModeTypes.CARD,
    paymentModeTypes.CASH_APP,
    paymentModeTypes.AFTERPAY,
    paymentModeTypes.ACH,
    paymentModeTypes.PAYPAL,
  ),
  allowNull: false,
  defaultValue: paymentModeTypes.CARD,
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
    tableName: "payments",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

Payment.beforeUpdate(touchUpdatedAt);

Payment.beforeDestroy(markDeleted);

module.exports = Payment;

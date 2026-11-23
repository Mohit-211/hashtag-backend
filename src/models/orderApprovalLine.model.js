const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// What the customer approves in an order's approval: order items of one product, colour and
// design (utils/approvalLines.js), frozen when the approval starts (migration 2026-11-23). status,
// current_version, approved_version and approved_event_id are worked out from the history
// (utils/approvalState.js).
class OrderApprovalLine extends Model {}
OrderApprovalLine.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    approval_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // JSON: the order_items ids.
    order_item_ids: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // JSON: colour, sizes, print methods, locations and the customer's artwork, as at the start.
    detail: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    // The team marked it "No proof needed".
    no_proof: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // NOT_SENT, NO_PROOF_NEEDED, WAITING, CHANGES_REQUESTED or APPROVED.
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: "NOT_SENT",
    },
    current_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    approved_version: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    approved_event_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE(3),
    },
    updated_at: {
      type: DataTypes.DATE(3),
    },
  },
  {
    sequelize,
    tableName: "order_approval_lines",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = OrderApprovalLine;

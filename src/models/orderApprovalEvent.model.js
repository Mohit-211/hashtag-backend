const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// The history of an order's approval, append-only (migration 2026-11-23): every action of the
// team, the customer and the payment hold, with its time, and for the customer the IP and
// browser. Rows are never changed or deleted; every status is worked out from them
// (utils/approvalState.js lists the types).
class OrderApprovalEvent extends Model {}
OrderApprovalEvent.init(
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
    line_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    file_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    // ADMIN, CUSTOMER or SYSTEM.
    actor: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // The event an undo, remove or restore is about.
    target_event_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // One Approve all, and its undo.
    batch_id: {
      type: DataTypes.CHAR(32),
      allowNull: true,
    },
    // A note's text, or the team's message with a version.
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // JSON: e.g. an email's recipient, or the hold's new state.
    meta: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE(3),
    },
  },
  {
    sequelize,
    tableName: "order_approval_events",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

module.exports = OrderApprovalEvent;

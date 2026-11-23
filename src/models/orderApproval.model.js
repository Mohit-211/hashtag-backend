const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// One per order: the proofs (mockups) the customer approves through an emailed link, with the
// label hold and the production lock (migration 2026-11-23). status, approved_at and
// last_customer_event_id are worked out from order_approval_events (utils/approvalState.js) and
// rewritten with every change (services/Common/approvalStore.js).
class OrderApproval extends Model {}
OrderApproval.init(
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
    // DRAFT, WAITING, CHANGES_REQUESTED or APPROVED.
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    // Whether the paid order's label waits for the team: NONE, PENDING_DECISION, HOLD or RELEASED.
    hold_state: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: "NONE",
    },
    // The link's key: its SHA-256 to find the approval, and an encrypted copy for Copy link.
    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: true,
    },
    token_enc: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    link_created_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    link_disabled_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    // Lock for production: the customer's page is read-only while it's set.
    locked_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    locked_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    first_sent_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    last_sent_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    approved_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    last_customer_event_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // The newest customer event an admin has seen on the Approval page.
    admin_seen_event_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // Empty when the payment hold made it.
    created_by: {
      type: DataTypes.INTEGER,
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
    tableName: "order_approvals",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = OrderApproval;

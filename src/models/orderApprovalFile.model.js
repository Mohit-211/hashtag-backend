const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// A file of an order's approval (migration 2026-11-23), in storage/approvals: a PROOF the team
// uploaded (version empty while it's a draft, set when it's sent), or a PICTURE the customer added
// to a note. Sent proofs are never removed; a draft that was never sent can be (removed_at).
class OrderApprovalFile extends Model {}
OrderApprovalFile.init(
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
      allowNull: false,
    },
    // PROOF or PICTURE.
    kind: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // A picture's note (order_approval_events.id).
    note_event_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    stored_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    // A proof's WebP preview; empty when one couldn't be made.
    preview_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    mime: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    bytes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    sha256: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    removed_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
    // A draft copied from a sent version: it shares that proof's file.
    copied_from_file_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE(3),
    },
  },
  {
    sequelize,
    tableName: "order_approval_files",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

module.exports = OrderApprovalFile;

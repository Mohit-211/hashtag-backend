const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

// Named quantity pricing the admins share and copy into product variants (migration
// 2026-11-12, panel F29). Not linked to products: loading one copies its rows.
// pricing_rows holds bulk_pricing rows for "tiered", quantity_pricing rows for "quantity_fixed".
// The table also has active_name, a generated column with a unique index that keeps names unique
// among templates that aren't deleted. It isn't an attribute here: the database fills it.
class PricingTemplate extends Model {}
PricingTemplate.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    pricing_mode: {
      type: DataTypes.ENUM("tiered", "quantity_fixed"),
      allowNull: false,
    },
    pricing_rows: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    // Milliseconds, so "newest first" holds for two saves in the same second.
    created_at: {
      type: DataTypes.DATE(3),
    },
    updated_at: {
      type: DataTypes.DATE(3),
    },
    deleted_at: {
      type: DataTypes.DATE(3),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "pricing_templates",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = PricingTemplate;

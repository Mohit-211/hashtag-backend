const { Sequelize, DataTypes, Model } = require("sequelize");

const sequelize = require("../config/central.db");

class ProductTierOverride extends Model {}

ProductTierOverride.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    use_case_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    tier_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM("include", "exclude"),
      allowNull: false,
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
  },
  {
    sequelize,
    tableName: "product_tier_overrides",
    timestamps: true,
    underscored: true,
    paranoid: false,

    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      {
        // A product can have only ONE tier per use case.
        // But the same product can have different tiers
        // in different use cases.
        unique: true,
        fields: ["product_id", "use_case_id"],
      },
    ],
  },
);

ProductTierOverride.beforeUpdate(async (override) => {
  override.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
});

module.exports = ProductTierOverride;
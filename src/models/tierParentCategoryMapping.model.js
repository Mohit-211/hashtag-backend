/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");

const sequelize = require("../config/central.db");

class TierParentCategoryMapping extends Model {}

TierParentCategoryMapping.init(
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
      allowNull: false,
    },

    parent_category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    tableName: "tier_parent_category_mapping",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",

    indexes: [
      {
        unique: true,
        fields: [
          "use_case_id",
          "tier_id",
          "parent_category_id",
        ],
      },
    ],
  },
);

TierParentCategoryMapping.beforeUpdate(async (mapping) => {
  mapping.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
});

TierParentCategoryMapping.beforeDestroy(async (mapping) => {
  mapping.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");

  mapping.is_active = false;
});

module.exports = TierParentCategoryMapping;
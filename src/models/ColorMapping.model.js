const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { utcNow, markDeleted } = require("./hooks");

class ColorMapping extends Model {}

ColorMapping.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    supplier: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    raw_color_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    normalized_color_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    hex_code: {
      type: DataTypes.STRING(100),
      defaultValue: "#CCCCCC",
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: "pending",
      comment: "approved | pending | rejected",
    },
    notes: {
      type: DataTypes.TEXT,
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
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "color_mappings",
    indexes: [
      {
        unique: true,
        fields: ["supplier", "normalized_color_name"],
      },
    ],
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

// ====================== HOOKS ======================

ColorMapping.beforeCreate(async (mapping) => {
  mapping.normalized_color_name =
    mapping.raw_color_name
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s/-]/g, "") || "";
});

ColorMapping.beforeUpdate(async (mapping) => {
  if (mapping.raw_color_name) {
    mapping.normalized_color_name =
      mapping.raw_color_name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9\s/-]/g, "") || "";
  }
  mapping.updated_at = utcNow();
});

ColorMapping.beforeDestroy(markDeleted);

module.exports = ColorMapping;

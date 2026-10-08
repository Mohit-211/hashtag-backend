/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class SSStyle extends Model {}

SSStyle.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    style_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    external_style_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    brand_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    brand_external_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    supplier: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    is_processed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    last_synced_at: {
      type: DataTypes.DATE,
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
    tableName: "ss_styles",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",

    indexes: [
      {
        unique: true,
        fields: ["external_style_id", "supplier"],
      },
    ],
  }
);

// ✅ Hooks (same as Brand)

SSStyle.beforeUpdate(async (style) => {
  style.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
});

SSStyle.beforeDestroy(async (style) => {
  style.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
  style.is_active = false;
});

module.exports = SSStyle;
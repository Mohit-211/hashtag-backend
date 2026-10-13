/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");

class Size extends Model {}
Size.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(50), // S, M, L, XL
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(50), // tshirt, jeans, shoes
      allowNull: true,
    },
    display_style: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "dropdown",
    },
    measurements: {
      type: DataTypes.JSON,
      // { chest: 40, length: 28, waist: 32 }
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
    tableName: "sizes",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
    indexes: [
      {
        unique: true,
        fields: ["product_id", "name"],
      },
    ],
  },
);

Size.beforeUpdate(touchUpdatedAt);
Size.beforeDestroy(markDeleted);

module.exports = Size;

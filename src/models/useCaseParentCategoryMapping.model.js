const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");

class UseCaseParentCategoryMapping extends Model {}

UseCaseParentCategoryMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    use_case_id: {
      type: DataTypes.BIGINT.UNSIGNED,
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
    tableName: "use_case_parent_category_mapping",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",

    indexes: [
      {
        unique: true,
        fields: ["use_case_id", "parent_category_id"],
      },
    ],
  }
);

UseCaseParentCategoryMapping.beforeUpdate(touchUpdatedAt);

UseCaseParentCategoryMapping.beforeDestroy(markDeleted);

module.exports = UseCaseParentCategoryMapping;
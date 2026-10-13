/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { utcNow, markDeleted } = require("./hooks");
const slugify = require("slugify");

class ProductCategory extends Model {}
ProductCategory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    external_id: {
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
  tableName: "product_categories",
  timestamps: true,
  underscored: true,
  paranoid: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  deletedAt: "deleted_at",
  indexes: [
    {
      unique: true,
      fields: ["external_id", "supplier"],
    },
    {
      fields: ["is_active"],
    },
    {
      fields: ["supplier"],
    },
    {
      fields: ["is_active", "supplier", "title"],
    },
    {
      fields: ["deleted_at"],
    },
  ],
},
);

ProductCategory.beforeValidate((productCategory) => {
  if (productCategory.title) {
    productCategory.slug = slugify(productCategory.title, { lower: true });
  }
});

ProductCategory.beforeUpdate((productCategory) => {
  productCategory.updated_at = utcNow();
  if (productCategory.title) {
    productCategory.slug = slugify(productCategory.title, { lower: true });
  }
});

ProductCategory.beforeDestroy(markDeleted);

module.exports = ProductCategory;

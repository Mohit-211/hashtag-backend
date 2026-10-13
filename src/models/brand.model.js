/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { utcNow, markDeleted } = require("./hooks");
const slugify = require("slugify");

class Brand extends Model {}

Brand.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    slug: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },

    logo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    supplier: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    external_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    show_on_website: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    logo_url: {
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
    tableName: "brands",
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
    ],
  },
);

Brand.beforeValidate((brand) => {
  if (brand.name) {
    brand.slug = slugify(brand.name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
});

Brand.beforeUpdate((brand) => {
  brand.updated_at = utcNow();

  if (brand.name) {
    brand.slug = slugify(brand.name, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
});

Brand.beforeDestroy(markDeleted);

module.exports = Brand;
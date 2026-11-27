/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const slugify = require("slugify");

class CustomizationOption extends Model {
  /** The slug a name gets. Slugs are unique, but nothing reads them. */
  static slugFor(name) {
    return slugify(String(name), { lower: true, strict: true, trim: true });
  }
}

CustomizationOption.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    allow_text_input: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    allow_image_upload: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: "customization_options",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

/*
|--------------------------------------------------------------------------
| SLUG
|--------------------------------------------------------------------------
| Made from the name when a customization is made or renamed, unless a slug
| is given: the service gives one, because a deleted customization keeps its
| slug, so "Test" made again gets "test-2". These hooks used to remake the
| slug on every save, overwriting the "-deleted-<id>" slug a deleted
| customization is given, so the deleted one kept "test" (27 Nov).
*/

const fillSlug = (option) => {
  if (
    option.name &&
    !option.changed("slug") &&
    (option.isNewRecord || option.changed("name"))
  ) {
    option.slug = CustomizationOption.slugFor(option.name);
  }
};

CustomizationOption.beforeValidate(fillSlug);

CustomizationOption.beforeUpdate((option) => {
  option.updated_at = new Date();

  fillSlug(option);
});

module.exports = CustomizationOption;

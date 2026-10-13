/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { touchUpdatedAt, markDeleted } = require("./hooks");

class SourcingRequestAttachment extends Model {}

SourcingRequestAttachment.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    sourcing_request_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    file_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    file_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    file_uri: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    file_size: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    tableName: "sourcing_request_attachments",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

SourcingRequestAttachment.beforeUpdate(touchUpdatedAt);

SourcingRequestAttachment.beforeDestroy(markDeleted);

module.exports = SourcingRequestAttachment;
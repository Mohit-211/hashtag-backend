/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class SourcingRequest extends Model {}

SourcingRequest.init(
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

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    requested_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    details: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "IN_REVIEW",
        "ACCEPTED",
        "REJECTED",
        "COMPLETED"
      ),
      allowNull: false,
      defaultValue: "PENDING",
    },

    admin_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reviewed_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    brand_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
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
    tableName: "sourcing_requests",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",

    indexes: [
      {
        fields: ["email"],
      },
      {
        fields: ["request_type"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["created_at"],
      },
    ],
  },
);

module.exports = SourcingRequest;
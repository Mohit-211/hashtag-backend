/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class SourceRawData extends Model {}

SourceRawData.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    source_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    external_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    raw_json: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    processed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    sequelize,
    tableName: "source_raw_data",
    timestamps: false,
    underscored: true,
  }
);

module.exports = SourceRawData;
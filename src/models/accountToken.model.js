const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { accountTypes, accountTokenPurposes } = require("../config/types");

// One-time tokens sent by email (verification, password reset, account setup).
// Only the SHA-256 hash of the token is stored.
class AccountToken extends Model {}

AccountToken.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    account_type: {
      type: DataTypes.ENUM(...Object.values(accountTypes)),
      allowNull: false,
    },
    account_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    purpose: {
      type: DataTypes.ENUM(...Object.values(accountTokenPurposes)),
      allowNull: false,
    },
    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "account_tokens",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["account_type", "account_id", "purpose"] }],
  },
);

module.exports = AccountToken;

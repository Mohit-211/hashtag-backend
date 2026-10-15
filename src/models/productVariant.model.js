/** @format */

const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class ProductVariant extends Model {}

ProductVariant.init(
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
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    color: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    color_code: {
      type: DataTypes.STRING(255), // #FFFFFF
      allowNull: true,
    },
    size: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    case_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    last_supplier_sync_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    supplier_last_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    supplier_image_synced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    size_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    min_order_quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    max_order_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    track_inventory: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    import_batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    supplier: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    external_variant_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    retail_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    sale_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    map_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    unit_weight: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    case_qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    case_weight: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    case_length: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    case_width: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    case_height: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    country_of_origin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Status markers (migration 2026-10-16). The supplier marks the variant
    // discontinued or stops listing it; a sync brought back a removed variant.
    is_discontinued: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    discontinued_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    restored_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "product_variants",
    timestamps: true,
    underscored: true,
    paranoid: true,
  },
);

module.exports = ProductVariant;

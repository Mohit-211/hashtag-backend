const { Op } = require("sequelize");
const sequelize = require("../config/central.db");

// Shoppers only see what they can buy (client decision Q49). A variant is in stock when it has
// stock, or when its supplier doesn't report stock (track_inventory off, e.g. SAGE).
const variantInStock = () => ({
  [Op.or]: [{ stock: { [Op.gt]: 0 } }, { track_inventory: false }],
});

// For a Product query: the product has at least one variant on sale and in stock.
const productInStock = () =>
  sequelize.literal(
    "EXISTS (SELECT 1 FROM product_variants AS stocked" +
      " WHERE stocked.product_id = `Product`.`id`" +
      " AND stocked.is_active = 1 AND stocked.deleted_at IS NULL" +
      " AND (stocked.stock > 0 OR stocked.track_inventory = 0))",
  );

module.exports = { variantInStock, productInStock };

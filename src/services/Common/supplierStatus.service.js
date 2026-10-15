// Status markers shared by the supplier syncs (SAGE, SanMar, S&S, OttoCap).
//
// A variant the supplier lists again comes back: it's un-deleted and made active, and
// `restored_at` records when, so admins can see it happened. Whether the supplier calls
// it discontinued is kept separately in `is_discontinued` / `discontinued_at`.
const { Op } = require("sequelize");
const { Product, ProductVariant, VariantAttachment } = require("../../models");

// Un-deletes the product's variants whose SKU the supplier lists again.
// Returns the ids that were brought back.
const restoreListedVariants = async ({ productId, skus, transaction }) => {
  const listed = (skus || []).filter(Boolean).map(String);
  if (!listed.length) return [];

  const removed = await ProductVariant.findAll({
    where: {
      product_id: productId,
      sku: listed,
      deletedAt: { [Op.ne]: null },
    },
    attributes: ["id"],
    paranoid: false,
    transaction,
  });
  if (!removed.length) return [];

  const ids = removed.map((variant) => variant.id);
  await ProductVariant.restore({ where: { id: ids }, transaction });
  await ProductVariant.update(
    { is_active: true, restored_at: new Date() },
    { where: { id: ids }, transaction },
  );
  await VariantAttachment.restore({ where: { variant_id: ids }, transaction });
  return ids;
};

// Records that a sync brought back a product that had been removed.
const markProductRestored = (productId, transaction) =>
  Product.update({ restored_at: new Date() }, { where: { id: productId }, transaction });

// Marks variants the supplier stopped listing as discontinued (keeping the first date)
// and removes them from the catalog. They're kept as soft-deleted rows, not erased:
// order history points at them, and restoreListedVariants brings them back if the
// supplier lists them again.
const retireUnlistedVariants = async ({ ids, transaction }) => {
  if (!ids.length) return;
  await ProductVariant.update(
    { is_discontinued: true, discontinued_at: new Date() },
    { where: { id: ids, discontinued_at: null }, paranoid: false, transaction },
  );
  await ProductVariant.update(
    { is_active: false, is_discontinued: true },
    { where: { id: ids }, paranoid: false, transaction },
  );
  await VariantAttachment.destroy({ where: { variant_id: ids }, transaction });
  await ProductVariant.destroy({ where: { id: ids }, transaction });
};

// For admin screens: one word for where a variant stands.
//   removed       deleted (by an admin, or the supplier stopped listing it)
//   discontinued  the supplier marks it discontinued (it may still be on sale)
//   inactive      switched off
//   active        on sale
const variantStatus = (variant) => {
  if (variant.deletedAt || variant.deleted_at) return "removed";
  if (variant.is_discontinued) return "discontinued";
  return variant.is_active ? "active" : "inactive";
};

module.exports = {
  restoreListedVariants,
  markProductRestored,
  retireUnlistedVariants,
  variantStatus,
};

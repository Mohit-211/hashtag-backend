// Lists every product and variant image whose file is missing from <storage>/uploads/images,
// so the admins know what to upload again. Writes two CSV files to the logs folder:
//
//   missing-product-images-<date>.csv             one row per missing image
//   missing-product-images-by-product-<date>.csv  one row per product
//
// "needs_reupload" is "no" when nobody can see the image any more (the product, variant or
// image row was deleted). Nothing in the database changes; run it again after re-uploading
// to see what's left.
//
//   npm run report:missing-images

const fs = require("fs");
const path = require("path");
const { QueryTypes } = require("sequelize");

const { dirs, ensureStorageDirs } = require("../config/storage");
const { extractImageRefs } = require("./recoverImagesFromNextCache");

const IMAGE_ROWS = `
  SELECT 'product image' AS level, pa.id AS image_id, pa.file_uri, pa.is_primary,
         pa.created_at AS uploaded_at, pa.deleted_at AS image_deleted_at,
         NULL AS variant_id, NULL AS sku, NULL AS color, NULL AS size, NULL AS variant_deleted_at,
         p.id AS product_id, p.name AS product_name, p.supplier, p.is_active AS product_active,
         p.deleted_at AS product_deleted_at, p.created_at AS product_created_at, b.name AS brand
  FROM product_attachments pa
  JOIN products p ON p.id = pa.product_id
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE pa.file_uri LIKE '%/images/%'
  UNION ALL
  SELECT 'variant image', va.id, va.file_uri, va.is_primary,
         va.created_at, va.deleted_at,
         v.id, v.sku, v.color, v.size, v.deleted_at,
         p.id, p.name, p.supplier, p.is_active,
         p.deleted_at, p.created_at, b.name
  FROM variant_attachments va
  JOIN product_variants v ON v.id = va.variant_id
  JOIN products p ON p.id = v.product_id
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE va.file_uri LIKE '%/images/%'`;

const CATEGORIES = `
  SELECT m.product_id, GROUP_CONCAT(DISTINCT c.title ORDER BY c.title SEPARATOR '; ') AS categories
  FROM product_category_mapping m
  JOIN product_categories c ON c.id = m.product_category_id
  WHERE m.deleted_at IS NULL AND m.product_id IN (:ids)
  GROUP BY m.product_id`;

const formatDate = (value) => (value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "");

const productType = (supplier) =>
  !supplier || supplier === "MANUAL" ? "Manual (created in admin panel)" : `Imported from ${supplier}`;

const productStatus = (row) => (row.product_deleted_at ? "deleted" : row.product_active ? "active" : "inactive");

// Why an image does or doesn't need uploading again.
const reuploadReason = (row) => {
  if (row.product_deleted_at) return ["no", "product deleted"];
  if (row.variant_deleted_at) return ["no", "variant deleted"];
  if (row.image_deleted_at) return ["no", "image removed from product"];
  if (!row.product_active) return ["yes", "product is inactive (hidden from the website)"];
  return ["yes", "shown on the website"];
};

const buildReport = async (sequelize, { imageUrl, hosts }) => {
  const rows = await sequelize.query(IMAGE_ROWS, { type: QueryTypes.SELECT });

  // One entry per product and file: a variant image is usually shared by every size of a colour.
  const grouped = new Map();
  for (const row of rows) {
    const [ref] = extractImageRefs(row.file_uri, { imageUrl, hosts });
    if (!ref || fs.existsSync(path.join(dirs.images, ref.name))) continue;
    const [needs, reason] = reuploadReason(row);

    const key = `${row.product_id}|${row.level}|${ref.name}`;
    if (!grouped.has(key)) {
      grouped.set(key, { ...row, file: ref.name, is_primary: 0, needs_reupload: "no", reason, variants: new Set(), skus: new Set(), colors: new Set(), sizes: new Set() });
    }
    const image = grouped.get(key);
    // The image matters if any row using it is still visible.
    if (needs === "yes" && image.needs_reupload === "no") Object.assign(image, { needs_reupload: "yes", reason });
    if (row.is_primary && needs === "yes") image.is_primary = 1;
    if (row.variant_id) image.variants.add(row.variant_id);
    if (row.sku) image.skus.add(row.sku);
    if (row.color) image.colors.add(row.color);
    if (row.size) image.sizes.add(row.size);
    if (row.uploaded_at && (!image.uploaded_at || row.uploaded_at < image.uploaded_at)) image.uploaded_at = row.uploaded_at;
  }
  const images = [...grouped.values()];

  const ids = [...new Set(images.map((i) => i.product_id))];
  const categories = new Map();
  if (ids.length) {
    const found = await sequelize.query(CATEGORIES, { type: QueryTypes.SELECT, replacements: { ids } });
    for (const { product_id: id, categories: list } of found) categories.set(String(id), list);
  }

  const products = new Map();
  for (const image of images) {
    const key = String(image.product_id);
    if (!products.has(key)) {
      products.set(key, {
        product_id: image.product_id,
        product_name: image.product_name,
        product_type: productType(image.supplier),
        supplier: image.supplier || "",
        brand: image.brand || "",
        categories: categories.get(key) || "",
        product_status: productStatus(image),
        product_created_at: formatDate(image.product_created_at),
        needs_reupload: "no",
        images_to_reupload: 0,
        product_images_to_reupload: 0,
        variant_images_to_reupload: 0,
        main_image_missing: "no",
        variants_affected: new Set(),
        colors_affected: new Set(),
        missing_images_total: 0,
      });
    }
    const product = products.get(key);
    product.missing_images_total++;
    if (image.needs_reupload !== "yes") continue;

    product.needs_reupload = "yes";
    product.images_to_reupload++;
    if (image.level === "product image") product.product_images_to_reupload++;
    else product.variant_images_to_reupload++;
    if (image.is_primary) product.main_image_missing = "yes";
    for (const variant of image.variants) product.variants_affected.add(variant);
    for (const color of image.colors) product.colors_affected.add(color);
  }

  const byProduct = [...products.values()]
    .map((p) => ({
      ...p,
      variants_affected: p.variants_affected.size,
      colors_affected: [...p.colors_affected].sort().join("; "),
    }))
    .sort((a, b) => b.needs_reupload.localeCompare(a.needs_reupload) || String(a.product_name).localeCompare(String(b.product_name)));

  const detail = images
    .map((i) => ({
      needs_reupload: i.needs_reupload,
      reason: i.reason,
      product_id: i.product_id,
      product_name: i.product_name,
      product_type: productType(i.supplier),
      supplier: i.supplier || "",
      brand: i.brand || "",
      categories: categories.get(String(i.product_id)) || "",
      product_status: productStatus(i),
      level: i.level,
      main_image: i.is_primary ? "yes" : "no",
      color: [...i.colors].sort().join("; "),
      sizes: [...i.sizes].join("; "),
      variants: i.variants.size || "",
      skus: [...i.skus].join("; "),
      file: i.file,
      file_uri: i.file_uri,
      uploaded_at: formatDate(i.uploaded_at),
    }))
    .sort((a, b) =>
      b.needs_reupload.localeCompare(a.needs_reupload) ||
      String(a.product_name).localeCompare(String(b.product_name)) ||
      a.level.localeCompare(b.level) ||
      String(a.color).localeCompare(String(b.color)));

  return { detail, byProduct };
};

// CSV that Excel opens correctly: UTF-8 BOM, quoted fields, and no formulas from product names.
const toCsv = (rows) => {
  if (!rows.length) return "﻿";
  const columns = Object.keys(rows[0]);
  const cell = (value) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${[columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n")}\r\n`;
};

if (require.main === module) {
  const imageUrl = process.env.IMAGE_BASE_URL;
  if (!imageUrl) {
    console.error("Set IMAGE_BASE_URL in .env");
    process.exit(1);
  }
  const hosts = new Set([new URL(imageUrl).host.toLowerCase()]);
  const sequelize = require("../config/central.db");

  (async () => {
    ensureStorageDirs();
    const { detail, byProduct } = await buildReport(sequelize, { imageUrl, hosts });

    const date = new Date().toISOString().slice(0, 10);
    const detailFile = path.join(dirs.logs, `missing-product-images-${date}.csv`);
    const productFile = path.join(dirs.logs, `missing-product-images-by-product-${date}.csv`);
    fs.writeFileSync(detailFile, toCsv(detail));
    fs.writeFileSync(productFile, toCsv(byProduct));

    const needed = byProduct.filter((p) => p.needs_reupload === "yes");
    console.table({
      "products with missing images": { count: byProduct.length },
      "products to fix": { count: needed.length },
      "products not to fix (deleted, or only removed images)": { count: byProduct.length - needed.length },
      "products to fix whose main image is missing": { count: needed.filter((p) => p.main_image_missing === "yes").length },
      "missing image files": { count: detail.length },
      "image files to re-upload": { count: detail.filter((i) => i.needs_reupload === "yes").length },
    });
    console.log(`Per image:   ${detailFile}`);
    console.log(`Per product: ${productFile}`);
  })()
    .catch((error) => {
      console.error("Report failed:", error);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { buildReport, toCsv, reuploadReason };

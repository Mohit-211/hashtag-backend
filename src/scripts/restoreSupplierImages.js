// Re-downloads supplier images whose file is missing from storage.
//
// Every product and variant image imported from a supplier keeps the supplier's URL in
// `source_url` and our public URL (…/uploads/suppliers/…) in `file_uri`. For each such row
// whose file isn't in <storage>/uploads/suppliers, the image is downloaded again to the
// same path, so the URLs saved in the database work again. Nothing in the database changes.
//
//   npm run restore:supplier-images             # restore missing files
//   npm run restore:supplier-images -- --dry-run # only count what's missing
//
// Images uploaded by hand in the admin panel (/images/…) have no supplier URL and can't be
// restored this way.

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Op } = require("sequelize");

const { dirs, ensureStorageDirs } = require("../config/storage");

const BATCH_SIZE = 500;
const PARALLEL_DOWNLOADS = 5;
// Same rule as supplierImage.service: smaller files are supplier placeholders.
const MIN_IMAGE_BYTES = 5000;

// "https://host/uploads/suppliers/ss/123/a.jpg" -> "<storage>/uploads/suppliers/ss/123/a.jpg".
// Returns null for anything that doesn't resolve inside the suppliers folder.
const localPathFor = (fileUri) => {
  const marker = "/uploads/suppliers/";
  const at = String(fileUri || "").indexOf(marker);
  if (at === -1) return null;

  const relative = decodeURIComponent(String(fileUri).slice(at + marker.length).split(/[?#]/)[0]);
  const target = path.resolve(dirs.suppliers, relative);

  return target.startsWith(dirs.suppliers + path.sep) ? target : null;
};

const download = async (url) => {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  return Buffer.from(response.data);
};

// Runs fn over items, a few at a time.
const inParallel = async (items, limit, fn) => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
};

const restoreTable = async (Model, label, { dryRun, fetchImage, stats }) => {
  let lastId = 0;

  for (;;) {
    const rows = await Model.findAll({
      attributes: ["id", "file_uri", "source_url"],
      where: {
        id: { [Op.gt]: lastId },
        file_uri: { [Op.like]: "%/uploads/suppliers/%" },
        source_url: { [Op.ne]: null },
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
      raw: true,
    });
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    await inParallel(rows, PARALLEL_DOWNLOADS, async (row) => {
      stats.checked++;
      const target = localPathFor(row.file_uri);
      if (!target) {
        stats.skipped++;
        return;
      }
      if (fs.existsSync(target)) {
        stats.present++;
        return;
      }

      stats.missing++;
      if (dryRun) return;

      try {
        const buffer = await fetchImage(row.source_url);
        if (buffer.length < MIN_IMAGE_BYTES) {
          stats.placeholder++;
          return;
        }
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, buffer);
        stats.restored++;
      } catch (error) {
        stats.failed++;
        console.error(`${label} ${row.id}: ${row.source_url} -> ${error.response?.status || error.message}`);
      }
    });

    console.log(`${label}: checked ${stats.checked}, missing ${stats.missing}, restored ${stats.restored}, failed ${stats.failed}`);
  }
};

const restoreSupplierImages = async ({ models, dryRun = false, fetchImage = download }) => {
  ensureStorageDirs();

  const results = {};
  for (const [label, Model] of [
    ["product image", models.ProductAttachment],
    ["variant image", models.VariantAttachment],
  ]) {
    const stats = { checked: 0, present: 0, missing: 0, restored: 0, placeholder: 0, failed: 0, skipped: 0 };
    await restoreTable(Model, label, { dryRun, fetchImage, stats });
    results[label] = stats;
  }
  return results;
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const models = require("../models");
  const sequelize = require("../config/central.db");

  console.log(`${dryRun ? "Checking" : "Restoring"} supplier images in ${dirs.suppliers}`);

  restoreSupplierImages({ models, dryRun })
    .then((results) => {
      console.log("\nDone.");
      console.table(results);
      if (dryRun) console.log("Dry run: nothing was downloaded. Run without --dry-run to restore.");
    })
    .catch((error) => {
      console.error("Restore stopped:", error);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { restoreSupplierImages, localPathFor };

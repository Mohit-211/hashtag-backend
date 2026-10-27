/** @format */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { dirs } = require("../../config/storage");
const settings = require("../../config/settings");

// Stored as <storage>/uploads/suppliers/<supplier>/<style>/..., served at /uploads/suppliers/...
const SUPPLIER_IMAGE_DIR = dirs.suppliers;

// Public address of this API (Settings page, Website and links), used in the image URLs saved
// to the database.
const apiBaseUrl = () => settings.get("IMAGE_BASE_URL") || "https://node.hashtagbillionaire.com";

// 🔥 CLEAN FILE NAME
const sanitizeFileName = (name = "") => {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const downloadSupplierImage = async ({
  supplier,
  imageUrl,
  styleId,
  sku,
  imageType = "front",
}) => {
  try {
    if (!imageUrl) return null;

    // 🔥 IMAGE EXTENSION
    const ext = path.extname(imageUrl.split("?")[0])?.toLowerCase() || ".jpg";

    // 🔥 CREATE FOLDER
    const folder = path.join(
      SUPPLIER_IMAGE_DIR,
      supplier.toLowerCase(),
      String(styleId),
    );

    await fs.promises.mkdir(folder, { recursive: true });

    // 🔥 SAFE SKU
    const safeSku = sanitizeFileName(sku);

    // 🔥 FILE NAME
    const fileName = `${supplier.toLowerCase()}-${safeSku}-${imageType}${ext}`;

    // 🔥 ABSOLUTE SERVER PATH
    const localPath = path.join(folder, fileName);

    // 🔥 RELATIVE PATH
    const relativePath = `/uploads/suppliers/${supplier.toLowerCase()}/${styleId}/${fileName}`;

    // 🔥 FULL PUBLIC URL SAVED IN DB
    const dbPath = `${apiBaseUrl()}${relativePath}`;

    // 🔥 SKIP IF EXISTS
    if (fs.existsSync(localPath)) {
      return dbPath;
    }

    // 🔥 DOWNLOAD IMAGE

    const response = await axios({
      method: "GET",
      url: imageUrl,
      responseType: "arraybuffer",
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    // 🔥 CONVERT BUFFER
    const buffer = Buffer.from(response.data);
    // 🔥 SKIP INVALID / PLACEHOLDER IMAGES
    if (buffer.length < 5000) {
      console.log("⚠️ Placeholder or invalid image skipped:", imageUrl);

      return null;
    }

    // 🔥 SAVE FILE
    await fs.promises.writeFile(localPath, buffer);

    return dbPath;
  } catch (err) {
    console.error("❌ Supplier image download failed:", imageUrl, err?.response?.status || err.message);

    return null;
  }
};

module.exports = {
  downloadSupplierImage,
};

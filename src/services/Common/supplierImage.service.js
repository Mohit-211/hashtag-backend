/** @format */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 🔥 ALWAYS USE ROOT PROJECT PATH
const PUBLIC_DIR = path.join(process.cwd(), "public");

// 🔥 FINAL STORAGE:
// /public/uploads/suppliers/ss/7456/....
const SUPPLIER_IMAGE_DIR = path.join(PUBLIC_DIR, "uploads", "suppliers");

// 🔥 PUBLIC BASE URL
const BASE_URL = "https://node.hashtagbillionaire.com";

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
  let localPath = "";

  try {
    if (!imageUrl) return null;

    console.log("⬇️ Downloading Supplier Image");
    console.log("🌐 URL:", imageUrl);

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
    localPath = path.join(folder, fileName);

    // 🔥 RELATIVE PATH
    const relativePath = `/uploads/suppliers/${supplier.toLowerCase()}/${styleId}/${fileName}`;

    // 🔥 FULL PUBLIC URL SAVED IN DB
    const dbPath = `${BASE_URL}${relativePath}`;

    console.log("📁 Saving To:", localPath);
    console.log("🌍 Public URL:", dbPath);

    // 🔥 SKIP IF EXISTS
    if (fs.existsSync(localPath)) {
      console.log("✅ Image already exists");

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
    console.log("Image Size:", buffer.length);
    // 🔥 SKIP INVALID / PLACEHOLDER IMAGES
    if (buffer.length < 5000) {
      console.log("⚠️ Placeholder or invalid image skipped");
      console.log("🌐 URL:", imageUrl);

      return null;
    }

    // 🔥 SAVE FILE
    await fs.promises.writeFile(localPath, buffer);

    console.log("✅ Supplier image saved successfully");

    return dbPath;
  } catch (err) {
    console.error("❌ Supplier image download failed");
    console.error("🌐 URL:", imageUrl);
    console.error("📁 Path:", localPath);
    console.error(err);
    console.error(err?.errors);
    console.error("🚨 Error:", err?.response?.status || err.message);

    return null;
  }
};

module.exports = {
  downloadSupplierImage,
};

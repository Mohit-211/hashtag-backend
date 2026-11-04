const fs = require("fs");
const path = require("path");

const config = require("./config");

// Files live outside the repo so deploys (re-clones, git clean) never touch them.
// Defaults are folders next to the repo: /var/www/backend -> /var/www/storage, /var/www/logs.
const REPO_ROOT = path.resolve(__dirname, "../..");

const STORAGE_DIR = path.resolve(config.storageDir || path.join(REPO_ROOT, "../storage"));
const LOG_DIR = path.resolve(config.logDir || path.join(REPO_ROOT, "../logs"));

const dirs = {
  root: STORAGE_DIR,
  uploads: path.join(STORAGE_DIR, "uploads"),
  // Admin and customer uploads (product, brand, preview, profile images). Served at /images.
  images: path.join(STORAGE_DIR, "uploads", "images"),
  // Customers' graphics in any format. Kept out of uploads, which /uploads serves as they are;
  // /graphics only serves them as downloads (see app.js).
  graphics: path.join(STORAGE_DIR, "graphics"),
  // Images downloaded from suppliers. Served at /uploads/suppliers.
  suppliers: path.join(STORAGE_DIR, "uploads", "suppliers"),
  // Spreadsheets for the OttoCap import (otto_inventory.xlsx, otto_catalog.xlsx). Not served.
  ottocapImports: path.join(STORAGE_DIR, "imports", "ottocap"),
  logs: LOG_DIR,
};

// Creates every folder above if it's missing. Called once at startup.
const ensureStorageDirs = () => {
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

module.exports = {
  dirs,
  ensureStorageDirs,
};

// Recovers lost admin-uploaded images (/images/…) from the website's Next.js image cache.
//
// The website shows images through Next.js's image optimizer (/_next/image), which keeps a
// resized copy of every image it has served in <frontend>/.next/cache/images, and keeps serving
// that copy after the original is gone. This script finds every /images/… file the database
// refers to that is missing from <storage>/uploads/images, looks up its cached copies (largest
// size first) and saves one under the original file name. It only reads the cache folder; it
// doesn't contact the website, and nothing in the database changes.
//
//   npm run recover:next-images -- --dry-run     # list what's missing and what's in the cache
//   npm run recover:next-images
//
// Options
//   --frontend-dir <dir>  the website's folder (default ../frontend, i.e. /var/www/frontend)
//   --cache-dir <dir>     the image cache to read (default <frontend-dir>/.next/cache/images);
//                         point it at a backup copy of that folder if you made one
//   --image-url <url>     NEXT_PUBLIC_IMAGE_URL of the website (default IMAGE_BASE_URL)
//
// Recovered copies are resized and recompressed, so they're a stopgap until the originals are
// uploaded again. A copy exists only if the website displayed that image; customer artwork and
// images only shown in the admin panel can't be recovered this way.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { QueryTypes } = require("sequelize");

const { dirs, ensureStorageDirs } = require("../config/storage");

// Next.js defaults (deviceSizes + imageSizes), largest first, and its default quality.
const WIDTHS = [3840, 2048, 1920, 1200, 1080, 828, 750, 640, 384, 256, 128, 96, 64, 48, 32, 16];
const QUALITIES = [75];
// What a browser's Accept header turns into ('' when it accepts neither).
const MIME_TYPES = ["image/webp", "image/avif", ""];

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE_PATH = /^\/(?:uploads\/)?images\/([^/]+)$/;
// Absolute URLs, and relative /images/… or /uploads/images/… paths not inside a longer path.
const TOKEN = /https?:\/\/[^\s"'<>\\]+|(?<![\w./-])\/(?:uploads\/)?images\/[^\s"'<>\\]+/g;

const trimSlash = (url) => String(url || "").replace(/\/+$/, "");

// Next.js normalises absolute image URLs before hashing them.
const normalizeHref = (href) => {
  try {
    return new URL(href).toString();
  } catch {
    return null;
  }
};

// Every /images/<name> reference in a text value whose host is ours (or that has no host),
// with the URL the website would have passed to /_next/image for it.
const extractImageRefs = (value, { imageUrl, hosts }) => {
  const refs = [];
  for (const token of String(value || "").match(TOKEN) || []) {
    let pathname;
    let href;
    if (/^https?:/i.test(token)) {
      let url;
      try {
        url = new URL(token);
      } catch {
        continue;
      }
      if (!hosts.has(url.host.toLowerCase())) continue;
      pathname = url.pathname;
      href = token;
    } else {
      pathname = token.split(/[?#]/)[0];
      href = `${trimSlash(imageUrl)}${pathname}`;
    }

    const match = pathname.match(IMAGE_PATH);
    if (!match) continue;
    let name;
    try {
      name = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    const normalized = normalizeHref(href);
    if (FILE_NAME.test(name) && normalized) refs.push({ name, href: normalized });
  }
  return refs;
};

// Scans every text column of the app database for /images/ references.
// Returns Map(name -> { sources: Set("table.column"), hrefs: Set(url) }).
const findImageReferences = async (sequelize, { imageUrl, hosts }) => {
  const columns = await sequelize.query(
    `SELECT c.TABLE_NAME AS t, c.COLUMN_NAME AS c
     FROM information_schema.COLUMNS c
     JOIN information_schema.TABLES tb
       ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME AND tb.TABLE_TYPE = 'BASE TABLE'
     WHERE c.TABLE_SCHEMA = DATABASE()
       AND c.DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json')
       AND c.TABLE_NAME NOT LIKE '\\_archive\\_%'
     ORDER BY c.TABLE_NAME, c.COLUMN_NAME`,
    { type: QueryTypes.SELECT },
  );

  const refs = new Map();
  const canonical = (name) => normalizeHref(`${trimSlash(imageUrl)}/images/${name}`);

  for (const { t, c } of columns) {
    const rows = await sequelize.query(
      `SELECT DISTINCT \`${c}\` AS v FROM \`${t}\` WHERE \`${c}\` LIKE '%/images/%'`,
      { type: QueryTypes.SELECT },
    );
    for (const { v } of rows) {
      for (const { name, href } of extractImageRefs(v, { imageUrl, hosts })) {
        if (!refs.has(name)) refs.set(name, { sources: new Set(), hrefs: new Set([canonical(name)]) });
        const ref = refs.get(name);
        ref.sources.add(`${t}.${c}`);
        ref.hrefs.add(href);
      }
    }
  }
  return refs;
};

// The cache key function of the website's own Next.js version, or a copy of Next 16's.
const loadCacheKey = (frontendDir) => {
  try {
    const optimizer = require(require.resolve("next/dist/server/image-optimizer", { paths: [frontendDir] }));
    if (typeof optimizer.ImageOptimizerCache?.getCacheKey === "function") {
      return { getCacheKey: (params) => optimizer.ImageOptimizerCache.getCacheKey(params), from: "website's Next.js" };
    }
  } catch {
    // Fall through to the built-in copy.
  }
  const getCacheKey = ({ href, width, quality, mimeType }) => {
    const hash = crypto.createHash("sha256");
    for (const item of [4, href, width, quality, mimeType]) hash.update(String(item));
    return hash.digest("base64url");
  };
  return { getCacheKey, from: "built-in (Next.js 16)" };
};

const EXTENSION_TYPES = { webp: "image/webp", avif: "image/avif", png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };

// Largest cached copy of an image: { buffer, width, type, file } or null.
const findCachedCopy = async (cacheDir, hrefs, getCacheKey, cachedKeys) => {
  for (const width of WIDTHS) {
    for (const href of hrefs) {
      for (const quality of QUALITIES) {
        for (const mimeType of MIME_TYPES) {
          const key = getCacheKey({ href, width, quality, mimeType });
          if (!cachedKeys.has(key)) continue;

          const dir = path.join(cacheDir, key);
          const [file] = await fs.promises.readdir(dir);
          if (!file) continue;
          const extension = file.split(".")[4];
          return {
            buffer: await fs.promises.readFile(path.join(dir, file)),
            width,
            type: EXTENSION_TYPES[extension] || `image/${extension}`,
            file: path.join(key, file),
          };
        }
      }
    }
  }
  return null;
};

// sharp converts the cached copy (usually WebP) back to the file's own format, if available.
const loadSharp = (frontendDir) => {
  try {
    return require(require.resolve("sharp", { paths: [__dirname, frontendDir] }));
  } catch {
    return null;
  }
};

const SHARP_FORMATS = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", avif: "avif", gif: "gif" };

const toOwnFormat = async (sharp, buffer, type, name) => {
  const format = SHARP_FORMATS[path.extname(name).slice(1).toLowerCase()];
  if (!sharp || !format || type === `image/${format}` || type === "image/svg+xml") return buffer;
  return sharp(buffer).toFormat(format).toBuffer();
};

const recoverImages = async ({ refs, cacheDir, getCacheKey, dryRun = false, sharp = null }) => {
  const cachedKeys = new Set(fs.existsSync(cacheDir) ? await fs.promises.readdir(cacheDir) : []);
  const results = [];

  for (const [name, ref] of refs) {
    const row = { name, sources: [...ref.sources], status: "present" };
    results.push(row);
    if (fs.existsSync(path.join(dirs.images, name))) continue;

    const copy = await findCachedCopy(cacheDir, ref.hrefs, getCacheKey, cachedKeys);
    if (!copy) {
      row.status = "not cached";
      continue;
    }
    Object.assign(row, { status: dryRun ? "cached" : "recovered", width: copy.width, type: copy.type });
    if (dryRun) continue;

    try {
      const buffer = await toOwnFormat(sharp, copy.buffer, copy.type, name);
      await fs.promises.writeFile(path.join(dirs.images, name), buffer, { flag: "wx" });
    } catch (error) {
      Object.assign(row, { status: "failed", error: error.message });
    }
  }
  return results;
};

// Counts per source column, e.g. { "industries.image": { referenced: 12, missing: 12, ... } }.
const summarize = (results) => {
  const summary = {};
  for (const row of results) {
    for (const source of row.sources) {
      summary[source] = summary[source] || { referenced: 0, present: 0, missing: 0, cached: 0, recovered: 0, "not cached": 0, failed: 0 };
      summary[source].referenced++;
      if (row.status === "present") {
        summary[source].present++;
      } else {
        summary[source].missing++;
        summary[source][row.status]++;
      }
    }
  }
  return summary;
};

const argValue = (args, flag, fallback) => {
  const at = args.indexOf(flag);
  return at !== -1 && args[at + 1] ? args[at + 1] : fallback;
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const frontendDir = path.resolve(argValue(args, "--frontend-dir", path.join(__dirname, "../../../frontend")));
  const cacheDir = path.resolve(argValue(args, "--cache-dir", path.join(frontendDir, ".next/cache/images")));
  const imageUrl = argValue(args, "--image-url", process.env.IMAGE_BASE_URL);

  if (!imageUrl) {
    console.error("Set IMAGE_BASE_URL in .env or pass --image-url https://your-api-domain/");
    process.exit(1);
  }
  if (!fs.existsSync(cacheDir)) {
    console.error(`No image cache at ${cacheDir}. Pass --frontend-dir or --cache-dir.`);
    process.exit(1);
  }

  const hosts = new Set([new URL(imageUrl).host.toLowerCase()]);
  if (process.env.IMAGE_BASE_URL) hosts.add(new URL(process.env.IMAGE_BASE_URL).host.toLowerCase());

  const sequelize = require("../config/central.db");
  const { getCacheKey, from } = loadCacheKey(frontendDir);
  const sharp = loadSharp(frontendDir);

  (async () => {
    ensureStorageDirs();
    console.log(`Images folder: ${dirs.images}`);
    console.log(`Image cache:   ${cacheDir} (cache keys: ${from})`);
    console.log(sharp ? "sharp found: copies are saved in each file's own format" : "sharp not found: copies are saved as cached (usually WebP)");

    const refs = await findImageReferences(sequelize, { imageUrl, hosts });
    console.log(`${refs.size} image files referenced in the database`);

    const results = await recoverImages({ refs, cacheDir, getCacheKey, dryRun, sharp });

    const report = path.join(dirs.logs, `recover-next-images-${new Date().toISOString().slice(0, 10)}${dryRun ? "-dry-run" : ""}.csv`);
    const csv = ["file,status,width,sources"]
      .concat(results.map((r) => [r.name, r.status, r.width || "", r.sources.join(" ")].join(",")))
      .join("\n");
    fs.writeFileSync(report, `${csv}\n`);

    console.log("\nDone.");
    console.table(summarize(results));
    console.log(`Every file and its status: ${report}`);
    if (dryRun) console.log("Dry run: nothing was written. Run without --dry-run to recover the cached ones.");
  })()
    .catch((error) => {
      console.error("Recovery stopped:", error);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { extractImageRefs, findImageReferences, loadCacheKey, findCachedCopy, recoverImages, summarize };

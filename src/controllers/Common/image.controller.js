const axios = require("axios");
const { Op } = require("sequelize");

const { OttocapCatalog } = require("../../models");
const logger = require("../../config/logger");
const settings = require("../../config/settings");

// Proxy for OttoCap catalog images. It only fetches from hosts that the OttoCap
// catalog's image URLs point to (or OTTOCAP_IMAGE_HOSTS, comma separated, when set),
// and only returns images.
const MAX_BYTES = 10 * 1024 * 1024;
const HOSTS_TTL_MS = 60 * 60 * 1000;

let catalogHosts = { hosts: new Set(), loadedAt: 0 };

const hostOf = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

const getAllowedHosts = async () => {
  const configured = settings.get("OTTOCAP_IMAGE_HOSTS") || [];
  if (configured.length) return new Set(configured);

  if (Date.now() - catalogHosts.loadedAt > HOSTS_TTL_MS) {
    const rows = await OttocapCatalog.findAll({
      attributes: ["image_main"],
      where: { image_main: { [Op.ne]: null } },
      raw: true,
    });
    catalogHosts = {
      hosts: new Set(rows.map((row) => hostOf(row.image_main)).filter(Boolean)),
      loadedAt: Date.now(),
    };
  }

  return catalogHosts.hosts;
};

const getOttoImage = async (req, res) => {
  try {
    // Decoded once more, as before (some catalog links arrive double-encoded).
    const imageUrl = decodeURIComponent(String(req.query.url || ""));
    const allowedHosts = await getAllowedHosts();
    const host = hostOf(imageUrl);

    if (!host || !allowedHosts.has(host)) {
      return res.status(404).end();
    }

    const response = await axios.get(imageUrl, {
      responseType: "stream",
      timeout: 10000,
      maxRedirects: 3,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      // Redirects may only lead to another allowed host.
      beforeRedirect: (options) => {
        if (!allowedHosts.has(String(options.hostname || "").toLowerCase())) {
          throw new Error("Redirect to a host that isn't allowed");
        }
      },
    });

    const contentType = String(response.headers["content-type"] || "");
    if (!/^image\/(jpeg|png|gif|webp|avif)/i.test(contentType)) {
      response.data.destroy();
      return res.status(404).end();
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");

    let bytes = 0;
    response.data.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        response.data.destroy();
        res.destroy();
      }
    });

    response.data.pipe(res);
  } catch (error) {
    logger.warn(`OttoCap image proxy failed: ${error.message}`);
    if (!res.headersSent) res.status(404).end();
  }
};

module.exports = {
  getOttoImage,
};

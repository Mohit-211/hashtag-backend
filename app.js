const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const httpStatus = require("http-status");
const cron = require("node-cron");
const app = express();

const config = require("./src/config/config.js");
const logger = require("./src/config/logger.js");
const routes = require("./src/routes/v1");
const morgan = require("./src/config/morgan.js");
const corsConfigs = require("./src/config/corsConfigs.js");

const ApiError = require("./src/utils/ApiError.js");
const { uploadMiddleware } = require("./src/middlewares/upload.middleware.js");
const { runAccountCleanup } = require("./src/jobs/accountCleanup.js");
const errorHandler = require("./src/utils/errorHandler.js");
const { hideSupplierPricing } = require("./src/utils/publicResponse.js");
const {
  syncImportedSSProducts,
} = require("./src/services/Common/ssSync.service.js");
const {
  syncImportedSanmarProducts,
} = require("./src/services/Common/sanmarSync.service.js");
const {
  syncImportedOttoProducts,
} = require("./src/services/Common/ottoCapSync.service.js");
const {
  syncImportedSageProducts,
} = require("./src/services/Common/sageSync.service.js");
const { dirs, ensureStorageDirs } = require("./src/config/storage.js");
require("./src/models");

// Uploads, supplier images, imports and logs live outside the repo (see src/config/storage.js).
ensureStorageDirs();

// Behind nginx, req.ip must come from X-Forwarded-For for the rate limiters.
// "loopback" only trusts that header when the request comes from the same server.
app.set("trust proxy", config.trustProxy);

// Deletes unverified accounts past their deadline and old one-time tokens.
cron.schedule("*/15 * * * *", runAccountCleanup);

// Monthly supplier syncs (New York time). A run is skipped if the previous one of the same
// sync is still going; this app runs as a single process.
const running = new Set();
const scheduleMonthlySync = (name, expression, sync) =>
  cron.schedule(
    expression,
    async () => {
      if (running.has(name)) {
        logger.warn(`Monthly ${name} sync skipped: the previous run is still going`);
        return;
      }
      running.add(name);
      logger.info(`Monthly ${name} sync started`);
      try {
        await sync();
        logger.info(`Monthly ${name} sync finished`);
      } catch (err) {
        logger.error(`Monthly ${name} sync failed: ${err?.stack || err}`);
      } finally {
        running.delete(name);
      }
    },
    { timezone: "America/New_York" },
  );

scheduleMonthlySync("SAGE", "0 2 5 * *", syncImportedSageProducts);
scheduleMonthlySync("SanMar", "0 2 10 * *", syncImportedSanmarProducts);
scheduleMonthlySync("S&S", "0 2 15 * *", syncImportedSSProducts);
scheduleMonthlySync("OttoCap", "0 2 25 * *", syncImportedOttoProducts);

// set security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// gzip compression
app.use(compression());

if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// Every file under <storage>/uploads, e.g. /uploads/images/x.png and /uploads/suppliers/...
app.use(
  "/uploads",
  express.static(dirs.uploads, {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

// Admin and customer uploads (/images/x.png), public like /uploads above.
app.use(
  "/images",
  express.static(dirs.images, {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      if (filePath.endsWith(".avif")) {
        res.setHeader("Content-Type", "image/avif");
      }

      if (filePath.endsWith(".webp")) {
        res.setHeader("Content-Type", "image/webp");
      }
    },
  }),
);

// API CORS: only the origins in ACCESSDOMAINS (see corsConfigs). This is the only CORS layer.
app.use(cors(corsConfigs));

app.get("/api/healthcheck", function (req, res) {
  let data = {
    response: "ok",
  };
  res.status(200).send(data);
});

app.get("/test", (req, res, next) => {
  res.status(200).send("Hello World !!");
});

// Supplier cost and markup are removed from every response that isn't for an admin.
// Multipart parsing for all v1 api routes; files only on the routes listed in upload.middleware
app.use("/api/v1", hideSupplierPricing, uploadMiddleware, routes);


// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// error handling
app.use(errorHandler);

module.exports = app;

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const httpStatus = require("http-status");
const cron = require("node-cron");
const path = require("path");
const app = express();

const config = require("./src/config/config.js");
const routes = require("./src/routes/v1");
const morgan = require("./src/config/morgan.js");
const { authLimiter } = require("./src/middlewares/rateLimiter.js");
const corsConfigs = require("./src/config/corsConfigs.js");
const credentials = require("./src/middlewares/credentials.js");

const ApiError = require("./src/utils/ApiError.js");
const upload = require("./src/config/multer.js");
const errorHandler = require("./src/utils/errorHandler.js");
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
require("./src/models");
const PUBLIC_DIR = path.resolve(__dirname, "./public");

cron.schedule(
  "0 2 15 * *",
  async () => {
    try {
      console.log("🚀 STARTING MONTHLY SS SYNC");

      await syncImportedSSProducts();

      console.log("✅ MONTHLY SS SYNC COMPLETED");
    } catch (err) {
      console.error("❌ MONTHLY SS SYNC FAILED", err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "0 2 25 * *",
  async () => {
    try {
      console.log("🚀 STARTING MONTHLY OTTOCAP SYNC");

      await syncImportedOttoProducts();

      console.log("✅ MONTHLY OTTOCAP SYNC COMPLETED");
    } catch (err) {
      console.error("❌ MONTHLY OTTOCAP SYNC FAILED", err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "0 2 5 * *",
  async () => {
    try {
      console.log("🚀 STARTING MONTHLY SAGE SYNC");

      await syncImportedSageProducts();

      console.log("✅ MONTHLY SAGE SYNC COMPLETED");
    } catch (err) {
      console.error("❌ MONTHLY SAGE SYNC FAILED", err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "0 2 10 * *",
  async () => {
    try {
      console.log("🚀 STARTING MONTHLY Sanmar SYNC");

      await syncImportedSanmarProducts();

      console.log("✅ MONTHLY SS SYNC COMPLETED");
    } catch (err) {
      console.error("❌ MONTHLY SS SYNC FAILED", err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

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

app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.use(credentials);
app.use(cors(corsConfigs));

// limit repeated failed requests to auth endpoints
if (config.env === "production") {
  app.use("/v1/auth", authLimiter);
}

app.get("/api/healthcheck", function (req, res) {
  let data = {
    response: "ok",
  };
  res.status(200).send(data);
});

app.get("/test", (req, res, next) => {
  res.status(200).send("Hello World !!");
});

// Added multer with all v1 api routes
app.use("/api/v1", upload, routes);

// All File Apis
app.use(
  "/images",
  express.static(`${PUBLIC_DIR}/uploads/images`, {
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


app.use(
  "/uploads/suppliers",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(PUBLIC_DIR, "uploads/suppliers")),
);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// error handling
app.use(errorHandler);

module.exports = app;

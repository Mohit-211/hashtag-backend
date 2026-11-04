const express = require("express");
const router = express.Router();
const { graphicController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");

const { verifyAuthJWTToken } = userAuthMiddleware;

// The upload (field "graphic") is authenticated in upload.middleware first.
router.post("/", verifyAuthJWTToken, graphicController.uploadGraphic);
router.get("/", verifyAuthJWTToken, graphicController.getGraphics);

module.exports = router;

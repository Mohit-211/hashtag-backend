const express = require("express");
const router = express.Router();
const { galleryController } = require("../../../controllers");
const { adminAuthMiddleware } = require("../../../middlewares");

const { requireAdmin } = adminAuthMiddleware;

// Uploads (field "images", one per photo) are authenticated in upload.middleware first.
router.get("/", galleryController.getGallery);
router.get("/admin", requireAdmin, galleryController.getGalleryAdmin);
router.post("/", requireAdmin, galleryController.createGalleryImage);
router.put("/:id", requireAdmin, galleryController.updateGalleryImage);
router.delete("/:id", requireAdmin, galleryController.deleteGalleryImage);

module.exports = router;

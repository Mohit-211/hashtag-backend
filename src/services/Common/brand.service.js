const fs = require("fs");
const path = require("path");
const ssClient = require("../../config/ssClient");
const { dirs } = require("../../config/storage");
const { Brand, ImportBatch } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");
const { Op } = require("sequelize");
const pick = require("../../utils/pick");
const settings = require("../../config/settings");

// Fields an admin may set through the generic brand create and update endpoints.
const BRAND_FIELDS = ["name", "slug", "description", "show_on_website", "is_active"];

const createBrand = async (body, files) => {
  let brandObj = pick(body, BRAND_FIELDS);

  // ✅ Handle logo like your pattern
  if (files?.images?.length) {
    brandObj.logo = `/images/${files.images[0].filename}`;
  }

  // ✅ Then create
  const brand = await Brand.create(brandObj);

  return brand;
};

const getAllBrands = async (query) => {
  try {
    let { page = 1, limit = 20, search = "" } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    const whereCondition = {
      is_active: true,
    };

    if (search?.trim()) {
      whereCondition.name = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    const { count, rows } = await Brand.findAndCountAll({
      where: whereCondition,

      limit,
      offset,

      order: [["name", "ASC"]],
    });

    return {
      data: rows,

      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};


const getAllSSBrands = async (query) => {
  try {
    let { page = 1, limit = 20, search = "" } = query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    const offset = (page - 1) * limit;

    const whereCondition = {
      is_active: true,
      supplier: "SS",
    };

    if (search?.trim()) {
      whereCondition.name = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    const { count, rows } = await Brand.findAndCountAll({
      where: whereCondition,

      limit,
      offset,

      order: [["name", "ASC"]],
    });

    return {
      data: rows,

      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getBrandById = async (id) => {
  const brand = await Brand.findOne({ where: { id, is_active: true } });
  if (!brand) throw new ApiError(httpStatus.NOT_FOUND, "Brand not found");
  return brand;
};

const updateBrand = async (body, id) => {
  const brand = await Brand.findByPk(id);
  if (!brand) throw new ApiError(httpStatus.NOT_FOUND, "Brand not found");

  await brand.update(pick(body, BRAND_FIELDS));
  return brand;
};

const deleteBrand = async (id) => {
  const brand = await Brand.findByPk(id);
  if (!brand) throw new ApiError(httpStatus.NOT_FOUND, "Brand not found");

  await brand.destroy();
  return true;
};

const publishBrand = async (body, files) => {
  try {
    const { brand_id, show_on_website } = body;

    const brand = await Brand.findByPk(brand_id);

    if (!brand) {
      throw new ApiError(httpStatus.NOT_FOUND, "Brand not found");
    }

    const isPublished = show_on_website === true || show_on_website === "true";

    const updateData = {
      show_on_website: isPublished,
    };

    // UNPUBLISH
    if (!isPublished) {
      if (brand.logo_url) {
        try {
          const fileName = brand.logo_url.split("/").pop();

          const filePath = path.join(dirs.images, path.basename(fileName));

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.log("Failed to delete logo file");
        }
      }

      updateData.logo_url = null;
    }

    // PUBLISH OR UPDATE LOGO
    if (files?.images?.[0]) {
      const file = files.images[0];

      updateData.logo_url = `${settings.getRequired("IMAGE_BASE_URL")}/images/${file.filename}`;
    }

    await brand.update(updateData);

    return brand;
  } catch (err) {
    console.error("Error in publishBrand:", err);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to save brand",
    );
  }
};

const getPublishedBrands = async (query) => {
  try {
    let { page = 1, limit = 20, search = "" } = query;

    page = Number(page);
    limit = Number(limit);

    const where = {
      show_on_website: true,
      is_active: true,
    };

    if (search?.trim()) {
      where.name = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await Brand.findAndCountAll({
      where,
      attributes: ["id", "name","slug", "logo_url"],
      limit,
      offset,
      order: [["name", "ASC"]],
    });

    return {
      total: count,
      page,
      limit,
      total_pages: Math.ceil(count / limit),
      data: rows,
    };
  } catch (err) {
    console.error("Error in getPublishedBrands:", err);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to fetch published brands",
    );
  }
};

const createManualBrand = async (body, files) => {
  try {
    const { name } = body;

    if (!name?.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Brand name is required");
    }

    const existingBrand = await Brand.findOne({
      where: {
        name: name.trim(),
      },
    });

    if (existingBrand) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Brand already exists");
    }

    let logoUrl = null;

    if (files?.images?.[0]) {
      const file = files.images[0];

      logoUrl = `${settings.getRequired("IMAGE_BASE_URL")}/images/${file.filename}`;
    }

    const brand = await Brand.create({
      name: name.trim(),
      supplier: "MANUAL",
      logo_url: logoUrl,
      show_on_website: true,
      is_active: true,
    });

    return brand;
  } catch (err) {
    console.error("Error in createManualBrand:", err);

    if (err instanceof ApiError) {
      throw err;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to create brand",
    );
  }
};

// import brand from s&s

const syncSSBrands = async () => {
  let batch;

  try {
    console.log("🚀 Starting S&S Brand Sync...");

    // ✅ 1. CREATE BATCH
    batch = await ImportBatch.create({
      source_name: "SS_BRAND",
      status: "processing",
    });

    // ✅ 2. FETCH DATA
    const res = await ssClient.get("/brands");
    const brands = res.data;

    let processed = 0;

    // ✅ 3. LOOP
    for (const b of brands) {
      try {
        await Brand.upsert({
          name: b.name,
          external_id: String(b.brandID),
          supplier: "SS",
          logo: b.image || null,
          import_batch_id: batch.id, // 🔥 IMPORTANT
        });

        processed++;
      } catch (err) {
        console.error("❌ Brand failed:", b.name, err.message);
      }
    }

    // ✅ 4. UPDATE BATCH
    await batch.update({
      status: "success",
      total_records: brands.length,
      processed_records: processed,
    });

    console.log("✅ S&S brands synced");
  } catch (err) {
    console.error("❌ S&S brand sync failed", err.message);

    // ❌ ROLLBACK ONLY THIS BATCH
    if (batch) {
      await Brand.destroy({
        where: {
          import_batch_id: batch.id,
        },
      });

      await batch.update({
        status: "failed",
        error_message: err.message,
      });
    }
  }
};


module.exports = {
  createBrand,
  getAllBrands,
  getAllSSBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  getPublishedBrands,
  publishBrand,
  createManualBrand,
  syncSSBrands,
};

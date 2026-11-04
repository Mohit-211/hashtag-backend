const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const httpStatus = require("http-status");
const { Op, UniqueConstraintError } = require("sequelize");

const { Cart, OrderItem, ProductVariant, UserGraphic } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { createVisualPrint, printsMatch } = require("../../utils/graphicPrint");
const { graphicIdsOf, assignGraphicFees } = require("../../utils/pricing/graphicFees");
const { parseJson, toFullImageUrl } = require("../../utils/orderFormat");
const { dirs } = require("../../config/storage");

// Saved graphics: every file a customer uploads is kept, once per distinct file, and is how the
// system knows whether a graphic is new. Recognition is per customer. The exact contents
// recognise any format; for readable pictures a visual comparison also recognises another file
// of the same picture. That file is saved as its own graphic, because it's what gets produced,
// but it shares same_as_id, and so its fee status, with the graphic it looks like.

const MAX_PAGE_SIZE = 100;

const graphicPath = (graphic) => `/graphics/${graphic.file_name}`;

const toResponse = (graphic) => ({
  id: graphic.id,
  file_url: toFullImageUrl(graphicPath(graphic)),
  original_name: graphic.original_name,
  mime_type: graphic.mime_type,
  file_size: Number(graphic.file_size),
  is_new: !graphic.first_order_id,
  created_at: graphic.created_at,
});

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");

    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

// A saved graphic can be reached by the same upload twice (one file on several variants), so
// its file is only removed when it's a separate copy.
const discardDuplicate = (file, graphic) => {
  if (file.filename !== graphic.file_name) {
    fs.promises.unlink(file.path).catch(() => {});
  }
};

// The customer's earlier graphic that looks like this print, if any.
const findLookalike = async (userId, visualPrint) => {
  if (!visualPrint) return null;

  const graphics = await UserGraphic.findAll({
    attributes: ["id", "same_as_id", "first_order_id", "visual_print"],
    where: { user_id: userId, visual_print: { [Op.ne]: null } },
    order: [["id", "ASC"]],
  });

  return graphics.find((graphic) => printsMatch(visualPrint, graphic.visual_print)) || null;
};

// Saves an uploaded file as the customer's graphic, or returns the one they already have.
const saveGraphic = async (userId, file) => {
  const file_hash = await hashFile(file.path);

  const saved = await UserGraphic.findOne({ where: { user_id: userId, file_hash } });

  if (saved) {
    discardDuplicate(file, saved);
    return saved;
  }

  const visual_print = await createVisualPrint(file.path);
  const lookalike = await findLookalike(userId, visual_print);

  try {
    return await UserGraphic.create({
      user_id: userId,
      same_as_id: lookalike ? lookalike.same_as_id || lookalike.id : null,
      first_order_id: lookalike?.first_order_id || null,
      file_hash,
      visual_print,
      file_name: file.filename,
      // multer reads the name as latin1; browsers send UTF-8.
      original_name: Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 255),
      mime_type: file.mimetype?.slice(0, 127) || null,
      file_size: file.size,
    });
  } catch (error) {
    // The same file uploaded twice at once: the other upload got there first.
    if (!(error instanceof UniqueConstraintError)) throw error;

    const winner = await UserGraphic.findOne({ where: { user_id: userId, file_hash } });
    discardDuplicate(file, winner);
    return winner;
  }
};

const uploadGraphic = async (user, files) => {
  const file = files?.graphic?.[0];

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Choose a graphic to upload.");
  }

  return toResponse(await saveGraphic(user.id, file));
};

const getGraphics = async (user, query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), MAX_PAGE_SIZE);

  const { rows, count } = await UserGraphic.findAndCountAll({
    attributes: { exclude: ["visual_print"] },
    where: { user_id: user.id },
    order: [["id", "DESC"]],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    data: rows.map(toResponse),

    pagination: {
      total: count,

      page,

      limit,

      totalPages: Math.ceil(count / limit),
    },
  };
};

// The customer's graphics with these ids. An id that isn't theirs is refused.
const findUserGraphics = async (userId, ids) => {
  if (!ids.length) return [];

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid graphic_id");
  }

  const graphics = await UserGraphic.findAll({
    attributes: { exclude: ["visual_print"] },
    where: { id: ids, user_id: userId },
  });

  if (graphics.length !== ids.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Graphic not found in your saved graphics");
  }

  return graphics;
};

// A graphic as it's kept on a cart or order line, for production.
const toLineGraphic = (graphic) => ({
  id: graphic.id,
  file_path: graphicPath(graphic),
  original_name: graphic.original_name,
});

// Moves the graphic fees to where the customer's cart says they belong. One graphic's fee
// depends on every line that has it, so this runs after any change to the cart, and before the
// cart is shown or ordered, because a line can also change when a graphic stops being new.
const applyGraphicFees = async (userId, transaction) => {
  // The lines checkout charges: one whose variant is gone is left out of the order.
  const lines = await Cart.findAll({
    where: { user_id: userId, is_active: true },
    include: [{ model: ProductVariant, as: "variant", attributes: ["id"], required: true }],
    transaction,
  });

  const ids = [...new Set(lines.flatMap((line) => graphicIdsOf(parseJson(line.customization_config))))];

  const graphics = ids.length
    ? await UserGraphic.findAll({
        attributes: ["id", "same_as_id", "first_order_id"],
        where: { id: ids, user_id: userId },
        transaction,
      })
    : [];

  const fees = assignGraphicFees(lines, new Map(graphics.map((graphic) => [Number(graphic.id), graphic])));

  for (const line of lines) {
    const snapshot = parseJson(line.pricing_snapshot);

    if (!snapshot?.customization_price) continue;

    const charged = Number(snapshot.customization_price.setup_fee || 0);
    const fee = fees.get(Number(line.id)) || 0;

    if (fee !== charged) {
      await line.update(
        {
          pricing_snapshot: {
            ...snapshot,

            customization_price: { ...snapshot.customization_price, setup_fee: fee },

            total_price: Number((Number(snapshot.total_price) - charged + fee).toFixed(2)),
          },
        },
        { transaction },
      );
    }
  }
};

// A paid order ends "new" for its graphics and everything that looks like them.
const markGraphicsOrdered = async (order) => {
  const items = await OrderItem.findAll({
    attributes: ["customization_config"],
    where: { order_id: order.id },
  });

  const ids = [...new Set(items.flatMap((item) => graphicIdsOf(parseJson(item.customization_config))))];

  if (!ids.length) return;

  const graphics = await UserGraphic.findAll({
    attributes: ["id", "same_as_id"],
    where: { id: ids, user_id: order.user_id },
  });

  const designs = graphics.map((graphic) => graphic.same_as_id || graphic.id);

  await UserGraphic.update(
    { first_order_id: order.id },
    {
      where: {
        user_id: order.user_id,
        first_order_id: null,
        [Op.or]: [{ id: designs }, { same_as_id: designs }],
      },
    },
  );
};

// A cancelled order no longer counts: its graphics are new again.
const releaseOrderGraphics = (order, transaction) =>
  UserGraphic.update(
    { first_order_id: null },
    { where: { first_order_id: order.id }, transaction },
  );

// Removes these graphics' files, once their rows are gone.
const removeGraphicFiles = (graphics) => {
  for (const { file_name } of graphics) {
    fs.promises.unlink(path.join(dirs.graphics, path.basename(file_name))).catch(() => {});
  }
};

module.exports = {
  saveGraphic,
  uploadGraphic,
  getGraphics,
  findUserGraphics,
  toLineGraphic,
  applyGraphicFees,
  markGraphicsOrdered,
  releaseOrderGraphics,
  removeGraphicFiles,
};

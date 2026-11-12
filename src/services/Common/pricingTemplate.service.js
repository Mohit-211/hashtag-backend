const httpStatus = require("http-status");
const { Op, UniqueConstraintError } = require("sequelize");
const ApiError = require("../../utils/ApiError");
const { PricingTemplate } = require("../../models");
const { parseJson } = require("../../utils/orderFormat");
const { parseBulkPricing, parseQuantityPricing } = require("../../utils/pricing/pricingRows");

// Pricing templates (panel F29): named quantity pricing every admin shares. Loading one copies
// its rows into a product, so changing or deleting a template never changes a product.

const NAME_MAX_LENGTH = 100;
const MAX_ROWS = 50;

const badRequest = (message) => new ApiError(httpStatus.BAD_REQUEST, message);

const nameTaken = (name) =>
  new ApiError(httpStatus.CONFLICT, `A template called "${name}" already exists. Use another name.`);

// The API's shape: only the list for the template's pricing_mode is set, the other is null.
const toTemplate = (template) => {
  const rows = parseJson(template.pricing_rows) || [];

  return {
    id: template.id,
    name: template.name,
    pricing_mode: template.pricing_mode,
    bulk_pricing: template.pricing_mode === "tiered" ? rows : null,
    quantity_pricing: template.pricing_mode === "quantity_fixed" ? rows : null,
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
};

// Checks a POST or PUT body and returns what to save. Messages are shown to the admin as they are.
const readBody = (body = {}) => {
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    throw badRequest("Give the template a name.");
  }

  // Characters, as VARCHAR(100) counts them.
  if (Array.from(name).length > NAME_MAX_LENGTH) {
    throw badRequest(`A template's name can be at most ${NAME_MAX_LENGTH} characters.`);
  }

  const mode = body.pricing_mode;

  if (mode !== "tiered" && mode !== "quantity_fixed") {
    throw badRequest(
      'A template holds Variable ranges or Fixed quantities pricing (pricing_mode "tiered" or "quantity_fixed").',
    );
  }

  const tiered = mode === "tiered";
  const rows = tiered ? body.bulk_pricing : body.quantity_pricing;

  if (!Array.isArray(rows) || !rows.length) {
    throw badRequest(`Pricing: add at least one ${tiered ? "tier" : "quantity"}.`);
  }

  if (rows.length > MAX_ROWS) {
    throw badRequest(`Pricing: a template can have at most ${MAX_ROWS} ${tiered ? "tiers" : "quantities"}.`);
  }

  return {
    name,
    pricing_mode: mode,
    // Only min_qty, max_qty and price, or quantity and price, as numbers.
    pricing_rows: tiered ? parseBulkPricing(rows, "Pricing") : parseQuantityPricing(rows, "Pricing"),
  };
};

// Names are unique among templates that aren't deleted, ignoring case: the column's collation
// compares without case. Deleted templates are left out by the model (paranoid).
const findNameClash = (name, exceptId = null) =>
  PricingTemplate.findOne({
    attributes: ["name"],
    where: { name, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) },
  });

// The unique index on active_name stops two admins saving the same name at the same moment,
// which the check above can't: both would pass it before either saves.
const saveName = async (save, name) => {
  try {
    return await save();
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;

    const clash = await findNameClash(name);
    throw nameTaken(clash?.name || name);
  }
};

const findTemplate = async (id) => {
  const templateId = Number(id);
  const template =
    Number.isInteger(templateId) && templateId > 0 ? await PricingTemplate.findByPk(templateId) : null;

  if (!template) {
    throw new ApiError(httpStatus.NOT_FOUND, "This pricing template doesn't exist. It may have been deleted.");
  }

  return template;
};

// Newest change first; the id breaks a tie.
const getPricingTemplates = async () => {
  const templates = await PricingTemplate.findAll({
    order: [
      ["updated_at", "DESC"],
      ["id", "DESC"],
    ],
  });

  return templates.map(toTemplate);
};

const createPricingTemplate = async (body, adminId = null) => {
  const values = readBody(body);
  const clash = await findNameClash(values.name);

  if (clash) {
    throw nameTaken(clash.name);
  }

  const template = await saveName(
    () => PricingTemplate.create({ ...values, created_by: adminId }),
    values.name,
  );

  return toTemplate(template);
};

const updatePricingTemplate = async (id, body) => {
  const template = await findTemplate(id);
  const values = readBody(body);
  const clash = await findNameClash(values.name, template.id);

  if (clash) {
    throw nameTaken(clash.name);
  }

  // Every save moves updated_at, so the template comes first in the list. Sequelize sets
  // updated_at itself and skips a save that changes nothing, so the rows are always written.
  template.set(values);
  template.changed("pricing_rows", true);
  await saveName(() => template.save(), values.name);

  return toTemplate(template);
};

// Soft delete: the row stays, with deleted_at set, and its name can be used again.
const deletePricingTemplate = async (id) => {
  const template = await findTemplate(id);
  await template.destroy();
};

module.exports = {
  getPricingTemplates,
  createPricingTemplate,
  updatePricingTemplate,
  deletePricingTemplate,
};

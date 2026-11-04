const axios = require("axios");
const { Carrier } = require("../models");
const settings = require("./settings");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const decodeHtmlEntities = require("../utils/decodeHtmlEntities");

// ShipStation API V2, with the V2 key from the ShipStation web app (Settings > Account > API
// Settings). What this calls a shipment is an order in the web app, and a label is its
// shipment. V1 is deprecated, and the standalone ShipStation API (formerly ShipEngine) is a
// separate account with no web app.
const shipstationApiClient = axios.create({
  baseURL: "https://api.shipstation.com",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// The key comes from the Settings page on every request, so a new one works without a restart.
shipstationApiClient.interceptors.request.use((request) => {
  request.headers["API-Key"] = settings.getRequired("SHIPSTATION_API_KEY");
  return request;
});

// The services customers can choose at checkout.
const ALLOWED_SERVICES = {
  ups_ground: "UPS Ground",
  ups_2nd_day_air: "UPS 2nd Day Air",
  ups_next_day_air: "UPS Next Day Air",
  usps_priority_mail: "USPS Priority Mail",
  fedex_ground: "FedEx Ground",
};

// What ShipStation said went wrong, as text for the logs and the admin.
const shipstationMessage = (error) =>
  error.response?.data?.errors?.map((item) => item.message).join(" ") ||
  error.response?.data?.message ||
  error.message;

const mapAddress = (address) => ({
  name: address.name,
  phone: address.phone || "9999999999",
  address_line1: address.address_line1,
  address_line2: address.address_line2 || null,
  city_locality: address.city,
  state_province: address.state,
  postal_code: address.postal_code,
  // New addresses arrive with country_code; saved addresses store it in country.
  country_code: address.country_code || address.country || "US",
  // The address check works out whether it's residential, which some carriers charge more for.
  address_residential_indicator: "unknown",
});

// The sender on labels and rate quotes (Settings page, Shipping).
const getShipFromAddress = () => ({
  name: settings.getRequired("SHIP_FROM_NAME"),
  phone: settings.getRequired("SHIP_FROM_PHONE"),
  address_line1: settings.getRequired("SHIP_FROM_ADDRESS_LINE1"),
  city_locality: settings.getRequired("SHIP_FROM_CITY"),
  state_province: settings.getRequired("SHIP_FROM_STATE"),
  postal_code: settings.getRequired("SHIP_FROM_POSTAL_CODE"),
  country_code: settings.get("SHIP_FROM_COUNTRY"),
  address_residential_indicator: "no",
});

// Weight of one piece in lb: an admin's weight, else the supplier's, else the default (Q31).
const shippingWeightLb = (variant) =>
  Number(variant?.admin_weight_lb) || Number(variant?.unit_weight) || settings.get("DEFAULT_PACKAGE_WEIGHT_LB");

// The whole order in one box, the same for the quote and the label. items are cart lines or
// order items, with their variant.
const buildPackages = (items) => {
  const totalWeight = items.reduce((sum, item) => sum + item.quantity * shippingWeightLb(item.variant), 0);

  return [
    {
      weight: {
        value: Number(parseFloat(totalWeight || 1).toFixed(2)),
        unit: "pound",
      },

      dimensions: {
        length: 12,
        width: 10,
        height: 6,
        unit: "inch",
      },
    },
  ];
};

// The carrier's whole charge: surcharges such as fuel are in other_amount, not shipping_amount.
const ratePrice = (rate) =>
  Number(
    (
      Number(rate.shipping_amount?.amount || 0) +
      Number(rate.insurance_amount?.amount || 0) +
      Number(rate.confirmation_amount?.amount || 0) +
      Number(rate.other_amount?.amount || 0)
    ).toFixed(2),
  );

// USPS answers with a rate per kind of packaging: its own flat rate boxes and envelopes, and
// "package" for a box of ours, which is what the team ships in. UPS leaves the type empty.
const isOwnBoxRate = (rate) => !rate.package_type || rate.package_type === "package";

const isAddressError = (errors) =>
  (errors || []).some((item) => item.error_code === "invalid_address");

// A bad address is for the customer to fix. Anything else is ours, so they get a plain message.
const ratesError = (errors, details) => {
  if (isAddressError(errors)) {
    return new ApiError(
      httpStatus.BAD_REQUEST,
      "We couldn't verify this address. Please check it and try again.",
    );
  }

  console.error("🚨 Get Shipping Rates Error:", details);

  return new ApiError(
    httpStatus.BAD_GATEWAY,
    "We couldn't get shipping rates right now. Please try again.",
  );
};

// ====================== GET SHIPPING RATES ======================
const getShippingRates = async ({ address, items }) => {
  const carriers = await Carrier.findAll({ where: { is_active: true } });
  const carrierIds = [...new Set(carriers.map((carrier) => carrier.carrier_id))];

  if (!carrierIds.length) throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, "No active carriers found");

  let response;

  try {
    response = await shipstationApiClient.post("/v2/rates", {
      // Quick rates aren't stored. An ordinary rate request saves a shipment, and shipments show
      // as orders in the web app, so every customer comparing prices would leave one there.
      rate_options: { carrier_ids: carrierIds, rate_type: "quick" },

      shipment: {
        validate_address: "validate_and_clean",
        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),
        packages: buildPackages(items),
      },
    });
  } catch (error) {
    throw ratesError(error.response?.data?.errors, shipstationMessage(error));
  }

  const { rates = [], errors = [] } = response.data?.rate_response || {};

  if (!rates.length && errors.length) {
    throw ratesError(errors, errors.map((item) => item.message).join(" "));
  }

  const serviceMap = {};

  for (const rate of rates) {
    const code = rate.service_code;
    if (!ALLOWED_SERVICES[code] || !isOwnBoxRate(rate)) continue;

    const price = ratePrice(rate);

    if (!serviceMap[code] || price < serviceMap[code].price) {
      serviceMap[code] = {
        label: ALLOWED_SERVICES[code],
        service_code: code,
        carrier_code: rate.carrier_code,
        carrier_id: rate.carrier_id,
        price,
        delivery_days: rate.delivery_days,
        delivery_text: rate.carrier_delivery_days,
      };
    }
  }

  return Object.values(serviceMap);
};

// ====================== CREATE ORDER IN THE DASHBOARD ======================
// create_sales_order is what the guide to the Orders tab asks for; the migration guide says
// shipments show there without it, so sending it is right either way.
const createShipment = async ({ order, orderItems, address, carrierId }) => {
  const money = (amount) => ({
    currency: order.currency.toLowerCase(),
    amount: Number(amount || 0),
  });

  const { data } = await shipstationApiClient.post("/v2/shipments", {
    shipments: [
      {
        validate_address: "validate_and_clean",
        // ShipStation also shows this as the order number.
        external_shipment_id: order.order_number,
        create_sales_order: true,

        carrier_id: carrierId,
        requested_shipment_service: order.service_code,

        amount_paid: money(order.total_amount),
        shipping_paid: money(order.shipping_amount),
        tax_paid: money(order.tax_amount),

        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),
        packages: buildPackages(orderItems),

        items: orderItems.map((item) => ({
          name: decodeHtmlEntities(item.product?.name) || item.name,
          sku: item.sku,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
        })),
      },
    ],
  });

  const [shipment] = data.shipments || [];

  // The request can succeed with the shipment refused: the reason is on the shipment.
  if (data.has_errors || !shipment?.shipment_id) {
    throw new Error(shipment?.errors?.join(" ") || "ShipStation didn't create the shipment");
  }

  return shipment;
};

// ====================== CREATE LABEL ======================
// Buys the service the customer chose, through a rate on the order's own shipment. Quick rates
// from checkout can't be bought. The create-shipment guide also shows a service_code on the
// shipment, but the API's schema doesn't allow one, so this doesn't depend on it.
const purchaseLabel = async ({ shipmentId, carrierId, serviceCode }) => {
  const { data } = await shipstationApiClient.post("/v2/rates", {
    shipment_id: shipmentId,
    rate_options: { carrier_ids: [carrierId], service_codes: [serviceCode] },
  });

  const { rates = [], errors = [] } = data.rate_response || {};

  const rate = rates.find(
    (option) => option.service_code === serviceCode && option.rate_id && isOwnBoxRate(option),
  );

  if (!rate) {
    throw new Error(
      errors.map((item) => item.message).join(" ") || `${serviceCode} isn't available for this shipment`,
    );
  }

  const { data: label } = await shipstationApiClient.post(`/v2/labels/rates/${rate.rate_id}`, {
    label_format: "pdf",
    label_layout: "4x6",
    label_download_type: "url",
  });

  if (label.status === "error") {
    throw new Error(`ShipStation couldn't create the label for ${shipmentId}`);
  }

  return label;
};

// The label already bought for a shipment, if any.
const findLabel = async (shipmentId) => {
  const { data } = await shipstationApiClient.get("/v2/labels", {
    params: { shipment_id: shipmentId },
  });

  return (data.labels || []).find((label) => !label.voided && label.status !== "error") || null;
};

// ====================== CANCEL SHIPSTATION ORDER ======================
const cancelShipstationShipment = async (order) => {
  try {
    if (order.label_id) {
      console.log(`🚫 Voiding label: ${order.label_id}`);

      await shipstationApiClient.put(`/v2/labels/${order.label_id}/void`);

      console.log("✅ Label voided");
    }

    // A shipment with a label can only be cancelled once the label is void.
    if (order.shipment_id) {
      await shipstationApiClient.put(`/v2/shipments/${order.shipment_id}/cancel`);
    }
  } catch (error) {
    console.error("🚨 Cancel ShipStation Shipment Error:", shipstationMessage(error));
  }
};

module.exports = {
  shipstationApiClient,
  shipstationMessage,
  getShippingRates,
  createShipment,
  purchaseLabel,
  findLabel,
  cancelShipstationShipment,
};

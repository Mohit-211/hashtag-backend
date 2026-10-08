/** @format */

const axios = require("axios");
const { Address, OrderItem, Carrier, CarrierService, ProductVariant } = require("../models");
const { calculatePricing } = require("./pricing");

const shipstationClient = axios.create({
  baseURL: "https://api.shipstation.com",
  headers: {
    "Content-Type": "application/json",
    "API-Key": process.env.SHIPENGINE_API_KEY,
  },
});

const mapAddress = (address) => ({
  name: address.name,
  phone: address.phone || "9999999999",
  address_line1: address.address_line1,
  city_locality: address.city,
  state_province: address.state,
  postal_code: address.postal_code,
  country_code: address.country || "US",
});

const getShipFromAddress = () => ({
  name: "Patrick LaFleur",
  phone: "8327526450",
  address_line1: "4027 Spyder Spoiler Court",
  city_locality: "Katy",
  state_province: "TX",
  postal_code: "77494",
  country_code: "US",
});

const createShipstationOrder = async (order, cartItems, address) => {
  try {
    const items = cartItems.map((item) => {
      const v = item.variant;
      const pricing = calculatePricing(v.price, v.supplier);

      return {
        lineItemKey: `${order.order_number}-${v.sku}`,
        sku: v.sku,
        name: v.sku,
        quantity: item.quantity,
        unitPrice: pricing.final_price,
      };
    });

    const payload = {
      orderNumber: order.order_number,
      orderDate: new Date().toISOString(),
      orderStatus: "awaiting_shipment",

      customerUsername: `user_${order.user_id}`,

      billTo: {
        name: address.name,
        phone: address.phone || "9999999999",
      },

      shipTo: {
        name: address.name,
        phone: address.phone || "9999999999",
        street1: address.address_line1,
        city: address.city,
        state: address.state,
        postalCode: address.postal_code,
        country: address.country || "US",
      },

      items,

      amountPaid: order.total_amount,
      taxAmount: 0,
      shippingAmount: order.shipping_amount,

      carrierCode: order.carrier_code || null,
      serviceCode: order.service_code || null,
    };

    console.log("📦 SHIPSTATION V1 PAYLOAD:", payload);

    const response = await axios.post(
      "https://ssapi.shipstation.com/orders/createorder",
      payload,
      {
        auth: {
          username: process.env.SHIPSTATION_API_KEY,
          password: process.env.SHIPSTATION_API_SECRET,
        },
      }
    );

    console.log("✅ SHIPSTATION ORDER CREATED:", response.data);

    return response.data;

  } catch (error) {
    console.error(
      "🚨 SHIPSTATION ORDER ERROR:",
      error.response?.data || error.message
    );
    throw error;
  }
};

const createShipmentForOrder = async (order) => {
  try {
    const items = await OrderItem.findAll({
      where: { order_id: order.id },
      include: [{ model: ProductVariant, as: "variant" }],
    });

    const address = await Address.findByPk(order.address_id);

    const totalWeight = items.reduce((sum, i) => {
      const weight = Number(i.variant?.unit_weight || 0.5);
      return sum + i.quantity * weight;
    }, 0);

    console.log("⚖️ TOTAL WEIGHT:", totalWeight);

    return await createLabel(order, items, address, totalWeight);

  } catch (error) {
    console.error("🚨 Shipment failed:", error.message);
    throw error;
  }
};

const createLabel = async (order, items, address, totalWeight) => {
  try {
    const carrier = await Carrier.findOne({
      where: { carrier_code: order.carrier_code, is_active: true },
    });

    if (!carrier) throw new Error("Carrier not found");

    const payload = {
      validate_address: "validate_and_clean",
      label_download_type: "url",

      shipment: {
        carrier_id: carrier.carrier_id,
        service_code: order.service_code,

        external_order_id: order.order_number,

        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),

        packages: [
          {
            weight: {
              value: totalWeight || 1,
              unit: "pound",
            },
          },
        ],
      },
    };

    console.log("📦 LABEL PAYLOAD:", payload);

    const response = await shipstationClient.post("/v2/labels", payload);

    console.log("✅ LABEL CREATED:", response.data);

    return response.data;

  } catch (error) {
    console.error(
      "🚨 LABEL ERROR:",
      error.response?.data || error.message
    );
    throw error;
  }
};

const getShippingRates = async ({ address, items }) => {
  try {
    // ================================
    // ✅ CALCULATE TOTAL WEIGHT
    // ================================
    const totalWeight = items.reduce((sum, i) => {
      const weight = Number(i.variant?.unit_weight || 0.5);

      if (!weight) {
        console.warn(`⚠️ Missing weight for variant ${i.variant_id}`);
      }

      return sum + i.quantity * weight;
    }, 0);

    // ================================
    // ✅ GET ACTIVE CARRIERS
    // ================================
    const carriers = await Carrier.findAll({
      where: { is_active: true },
    });

    const carrierIds = carriers.map((c) => c.carrier_id);

    if (!carrierIds.length) {
      throw new Error("No active carriers found");
    }

    // ================================
    // ✅ SHIPSTATION API CALL
    // ================================
    const res = await shipstationClient.post("/v2/rates", {
      rate_options: {
        carrier_ids: carrierIds,
      },
      shipment: {
        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),
        packages: [
          {
            weight: {
              value: totalWeight || 1,
              unit: "pound",
            },
          },
        ],
      },
    });

    const allRates = res.data?.rate_response?.rates || [];

    console.log(
      "📦 ALL RATES:",
      allRates.map((r) => ({
        carrier: r.carrier_code,
        code: r.service_code,
        price: r.shipping_amount?.amount,
      }))
    );

    // ================================
    // ✅ ONLY THESE SERVICES
    // ================================
    const ALLOWED = {
      ups_ground: "UPS Ground",
      ups_2nd_day_air: "UPS 2nd Day Air",
      ups_next_day_air: "UPS Next Day Air",
      usps_priority_mail: "USPS Priority Mail",
      fedex_ground: "FedEx Ground",
    };

    // ================================
    // ✅ FILTER ONLY ALLOWED SERVICES
    // ================================
    const filtered = allRates.filter((r) => ALLOWED[r.service_code]);

    // ================================
    // ✅ CHEAPEST PER SERVICE
    // ================================
    const serviceMap = {};

    for (let r of filtered) {
      const code = r.service_code;
      const price = Number(r.shipping_amount.amount);

      if (!serviceMap[code] || price < serviceMap[code].price) {
        serviceMap[code] = {
          label: ALLOWED[code],
          service_code: code,
          carrier_code: r.carrier_code,
          price,
          delivery_days: r.delivery_days,
          delivery_text: r.carrier_delivery_days,
        };
      }
    }

    // ================================
    // ✅ FEDEX FALLBACK (IMPORTANT)
    // ================================
    if (!serviceMap["fedex_ground"]) {
      const fedexRates = allRates
        .filter((r) => r.carrier_code === "fedex")
        .sort(
          (a, b) =>
            Number(a.shipping_amount.amount) -
            Number(b.shipping_amount.amount)
        );

      if (fedexRates.length) {
        const cheapestFedex = fedexRates[0];

        serviceMap["fedex_ground"] = {
          label: "FedEx (Cheapest Available)",
          service_code: cheapestFedex.service_code,
          carrier_code: "fedex",
          price: Number(cheapestFedex.shipping_amount.amount),
          delivery_days: cheapestFedex.delivery_days,
          delivery_text: cheapestFedex.carrier_delivery_days,
        };
      }
    }

    // ================================
    // ✅ FINAL RESPONSE
    // ================================
    return Object.values(serviceMap);

  } catch (error) {
    console.error("🚨 RATE ERROR:", error.response?.data || error.message);
    return [];
  }
};

const validateAddress = async (address) => {
  try {
    const response = await shipstationClient.post("/v1/addresses/validate", [
      {
        name: address.name,
        phone: address.phone,
        address_line1: address.address_line1,
        address_line2: address.address_line2 || "",
        city_locality: address.city,
        state_province: address.state,
        postal_code: address.postal_code,
        country_code: address.country_code || "US",
      },
    ]);

    const result = response.data[0];

    if (!result) {
      throw new Error("Address validation failed");
    }

    if (
      result.status === "verified" ||
      result.status === "partially_verified"
    ) {
      return result.matched_address;
    }

    // ❌ Handle user-friendly error
    const message =
      result.messages?.[0]?.message ||
      "Invalid address. Please check street, city, and ZIP code.";

    throw new Error(message);
  } catch (error) {
    console.error(
      "🚨 VALIDATION ERROR:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

module.exports = {
  shipstationClient,
  createShipstationOrder,
  getShippingRates,
  createShipmentForOrder,
  validateAddress,
};

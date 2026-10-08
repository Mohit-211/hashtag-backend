const axios = require("axios");
const {
  Address,
  OrderItem,
  Carrier,
  ProductVariant,
} = require("../models");
const { calculatePricing } = require("./pricing");

// ====================== SHIPSTATION V2 CLIENT ======================
const shipstationApiClient = axios.create({
  baseURL: "https://api.shipstation.com",
  headers: {
    "Content-Type": "application/json",
    "API-Key": process.env.SHIPSTATION_API_KEY,
  },
  timeout: 15000,
});

const mapAddress = (address) => ({
  name: address.name,
  phone: address.phone || "9999999999",
  address_line1: address.address_line1,
  address_line2: address.address_line2 || "",
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

// ====================== CREATE ORDER + SHIPMENT IN DASHBOARD ======================
const createShipstationOrderV2 = async (
  order,
  cartItems,
  address,
  totalWeight,
) => {
  try {
    const items = [];

    /*
     |--------------------------------------------------------------------------
     | ITEMS
     |--------------------------------------------------------------------------
     */

    for (const item of cartItems) {
      const v = item.variant;

      /*
       |--------------------------------------------------------------------------
       | PARSE SNAPSHOT
       |--------------------------------------------------------------------------
       */

      let pricingSnapshot = item.pricing_snapshot;

      if (pricingSnapshot && typeof pricingSnapshot === "string") {
        pricingSnapshot = JSON.parse(pricingSnapshot);
      }

      /*
       |--------------------------------------------------------------------------
       | UNIT PRICE
       |--------------------------------------------------------------------------
       */

      let unitPrice = 0;

      /*
       |--------------------------------------------------------------------------
       | CUSTOM PRODUCT
       |--------------------------------------------------------------------------
       */

      if (pricingSnapshot) {
        unitPrice = Number(pricingSnapshot.final_price_per_item || 0);
      } else {
        /*
       |--------------------------------------------------------------------------
       | NORMAL PRODUCT
       |--------------------------------------------------------------------------
       */
        const effectivePrice =
          v.case_price && Number(v.case_price) > 0 ? v.case_price : v.price;

        const pricing = await calculatePricing(effectivePrice, v.supplier);

        unitPrice = pricing.final_price;
      }

      /*
       |--------------------------------------------------------------------------
       | PUSH ITEM
       |--------------------------------------------------------------------------
       */

      items.push({
        name: v.sku || "Product",

        sku: v.sku || "SKU",

        quantity: Number(item.quantity),

        unit_price: Number(unitPrice.toFixed(2)),
      });
    }

    /*
     |--------------------------------------------------------------------------
     | PAYLOAD
     |--------------------------------------------------------------------------
     */

    const payload = {
      shipments: [
        {
          external_shipment_id: order.order_number,

          shipment_number: order.order_number,

          shipment_status: "pending",

          /*
           |--------------------------------------------------------------------------
           | ADDRESS
           |--------------------------------------------------------------------------
           */

          ship_to: mapAddress(address),

          ship_from: getShipFromAddress(),

          /*
           |--------------------------------------------------------------------------
           | PACKAGE
           |--------------------------------------------------------------------------
           */

          packages: [
            {
              weight: {
                value: Number(parseFloat(totalWeight || 1).toFixed(2)),

                unit: "pound",
              },
            },
          ],

          /*
           |--------------------------------------------------------------------------
           | ITEMS
           |--------------------------------------------------------------------------
           */

          items,
        },
      ],
    };

    console.log("📦 SHIPSTATION PAYLOAD:", JSON.stringify(payload, null, 2));

    /*
     |--------------------------------------------------------------------------
     | CREATE SHIPMENT
     |--------------------------------------------------------------------------
     */

    const response = await shipstationApiClient.post("/v2/shipments", payload);

    console.log("✅ Shipment Created In Dashboard");

    return response.data;
  } catch (error) {
    console.error(
      "🚨 V2 Order Creation Error:",

      JSON.stringify(
        error.response?.data || error.message,

        null,

        2,
      ),
    );

    return null;
  }
};

// ====================== CREATE LABEL ======================
const createLabel = async (order, address, totalWeight) => {
  try {
    const carrier = await Carrier.findOne({
      where: { carrier_code: order.carrier_code, is_active: true },
    });

    if (!carrier) throw new Error(`Carrier not found: ${order.carrier_code}`);

    let carrierId = carrier.carrier_id?.toString().trim();
    if (carrierId && !carrierId.startsWith("se-")) {
      carrierId = `se-${carrierId}`;
    }

    const payload = {
      shipment: {
        carrier_id: carrierId,
        service_code: order.service_code,
        external_shipment_id: order.order_number,
        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),
        packages: [
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
        ],
        // packages: [
        //   {
        //     weight: { value: parseFloat(totalWeight) || 1, unit: "pound" },
        //   },
        // ],
      },
      validate_address: "validate_and_clean",
      label_download_type: "url",
      label_format: "pdf",
    };

    const response = await shipstationApiClient.post("/v2/labels", payload);
    console.log("✅ Label Created Successfully");
    return response.data;
  } catch (error) {
    console.error(
      "🚨 Label Creation Error:",
      JSON.stringify(error.response?.data || error.message, null, 2),
    );
    throw error;
  }
};

// ====================== FULL SHIPMENT FLOW ======================
const createShipmentForOrder = async (order) => {
  try {
    const orderItems = await OrderItem.findAll({
      where: { order_id: order.id },
      include: [{ model: ProductVariant, as: "variant" }],
    });

    const address = await Address.findByPk(order.address_id);
    const totalWeight = orderItems.reduce((sum, i) => {
      return sum + i.quantity * Number(i.variant?.unit_weight || 0.5);
    }, 0);

    console.log(`⚖️ Total Weight: ${totalWeight} lbs`);

    // Create Order in Dashboard
    await createShipstationOrderV2(order, orderItems, address, totalWeight);

    // Create Actual Label
    // return await createLabel(order, address, totalWeight);
  } catch (error) {
    console.error("🚨 Create Shipment Failed:", error.message);
    throw error;
  }
};

const purchaseLabelForOrder = async (order) => {
  try {
    /*
     |--------------------------------------------------------------------------
     | ORDER ITEMS
     |--------------------------------------------------------------------------
     */

    const orderItems = await OrderItem.findAll({
      where: {
        order_id: order.id,
      },

      include: [
        {
          model: ProductVariant,

          as: "variant",
        },
      ],
    });

    /*
     |--------------------------------------------------------------------------
     | ADDRESS
     |--------------------------------------------------------------------------
     */

    const address = await Address.findByPk(order.address_id);

    if (!address) {
      throw new Error("Address not found");
    }

    /*
     |--------------------------------------------------------------------------
     | TOTAL WEIGHT
     |--------------------------------------------------------------------------
     */

    const totalWeight = orderItems.reduce(
      (sum, i) => {
        return sum + i.quantity * Number(i.variant?.unit_weight || 0.5);
      },

      0,
    );

    console.log(`⚖️ Label Weight: ${totalWeight} lbs`);

    /*
     |--------------------------------------------------------------------------
     | CREATE LABEL
     |--------------------------------------------------------------------------
     */

    const shipment = await createLabel(
      order,

      address,

      totalWeight,
    );

    console.log("✅ Label Purchased");

    return shipment;
  } catch (error) {
    console.error("🚨 Purchase Label Failed:", error.message);

    throw error;
  }
};

// ====================== CANCEL SHIPSTATION LABEL ======================
const cancelShipstationShipment = async (order) => {
  try {
    if (!order.label_id) {
      console.log("⚠️ No ShipStation label found");
      return;
    }

    // ================= VOID LABEL =================
    try {
      console.log(`🚫 Voiding label: ${order.label_id}`);

      await shipstationApiClient.put(`/v2/labels/${order.label_id}/void`);

      console.log("✅ Label voided");
    } catch (e) {
      console.error("🚨 Label Void Failed:", e.response?.data || e.message);
    }
  } catch (error) {
    console.error(
      "🚨 Cancel ShipStation Shipment Error:",
      error.response?.data || error.message,
    );
  }
};

// ====================== GET SHIPPING RATES ======================
const getShippingRates = async ({ address, items }) => {
  try {
    const totalWeight = items.reduce((sum, i) => {
      const weight = Number(i.variant?.unit_weight || 0.5);
      return sum + i.quantity * weight;
    }, 0);

    const carriers = await Carrier.findAll({ where: { is_active: true } });
    const carrierIds = carriers.map((c) => c.carrier_id);

    if (!carrierIds.length) throw new Error("No active carriers found");

    const res = await shipstationApiClient.post("/v2/rates", {
      rate_options: { carrier_ids: carrierIds },
      shipment: {
        ship_to: mapAddress(address),
        ship_from: getShipFromAddress(),
        // packages: [{ weight: { value: totalWeight || 1, unit: "pound" } }],
        packages: [
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
        ],
      },
    });

    const allRates = res.data?.rate_response?.rates || [];
    // ... (your existing filtering logic remains the same)
    const ALLOWED = {
      ups_ground: "UPS Ground",
      ups_2nd_day_air: "UPS 2nd Day Air",
      ups_next_day_air: "UPS Next Day Air",
      usps_priority_mail: "USPS Priority Mail",
      fedex_ground: "FedEx Ground",
    };

    const serviceMap = {};

    for (let r of allRates) {
      const code = r.service_code;
      if (!ALLOWED[code]) continue;

      const price = Number(r.shipping_amount?.amount || 0);

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

    return Object.values(serviceMap);
  } catch (error) {
    console.error(
      "🚨 Get Shipping Rates Error:",
      error.response?.data || error.message,
    );
    return [];
  }
};

// ====================== ADDRESS VALIDATION ======================
const validateAddress = async (addressInput) => {
  try {
    const payload = [mapAddress(addressInput)];

    const response = await shipstationApiClient.post(
      "/v1/addresses/validate",
      payload,
    ); // Note: Address validation is still under /v1 in some setups

    const result = response.data[0];

    if (
      result.status === "verified" ||
      result.status === "partially_verified"
    ) {
      console.log("✅ Address validated successfully");
      return result.matched_address || result;
    }

    throw new Error(
      result.messages?.[0]?.message || "Address validation failed",
    );
  } catch (error) {
    console.error(
      "🚨 Address Validation Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

module.exports = {
  shipstationApiClient,
  createShipstationOrderV2,
  createShipmentForOrder,
  purchaseLabelForOrder,
  cancelShipstationShipment,

  getShippingRates,
  validateAddress,
};

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { orderService } = require("../../services");
const {
  getShippingRates,
  listAvailableCarriers,
  createCheapTestLabel,
  testCarriers,
  createManualTestOrder,
  createShipmentForOrder,
  purchaseLabelForOrder,
} = require("../../config/shipstation");
const {
  Address,
  Cart,
  ProductVariant,
  Order,
  OrderItem,
} = require("../../models");
const ApiError = require("../../utils/ApiError");

const createOrder = catchAsync(async (req, res) => {
  const data = await orderService.createOrder(req.body);
  return responseWrapper(res, data, "Order Created", httpStatus.CREATED);
});

const getShippingRatesController = catchAsync(async (req, res) => {
  const { address_id, user } = req.body;

  const address = await Address.findOne({
    where: { id: address_id, user_id: user.id },
  });

  if (!address) {
    throw new ApiError(400, "Invalid address");
  }

  const cartItems = await Cart.findAll({
    where: { user_id: user.id, is_active: true },
    include: [{ model: ProductVariant, as: "variant", required: true }],
  });

  if (!cartItems.length) {
    throw new ApiError(400, "Cart is empty");
  }

  const rates = await getShippingRates({
    address,
    items: cartItems,
  });

  return responseWrapper(res, rates, "Shipping Rates", 200);
});

const getOrders = catchAsync(async (req, res) => {
  const data = await orderService.getOrders(req.body);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const getOrderById = catchAsync(async (req, res) => {
  const data = await orderService.getOrderById(req.body, req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const cancelOrder = catchAsync(async (req, res) => {
  const data = await orderService.cancelOrder(req.body, req.params.id);
  return responseWrapper(res, data, "", httpStatus.OK);
});

const shipstationWebhook = async (req, res) => {
  try {
    console.log("📩 ShipStation Webhook Received");

    console.log("📦 WEBHOOK:", JSON.stringify(req.body, null, 2));

    const data = req.body;

    const resource = data.resource || data.data || data;

    // ==================================================
    // FIND ORDER
    // ==================================================

    const orderNumber =
      resource.order_number ||
      resource.orderNumber ||
      resource.external_shipment_id ||
      resource.external_order_id ||
      data.order_number ||
      data.orderNumber;

    const trackingNumber = resource.tracking_number || data.tracking_number;

    let order = null;

    // ==================================================
    // FIND BY ORDER NUMBER
    // ==================================================

    if (orderNumber) {
      order = await Order.findOne({
        where: {
          order_number: orderNumber,
        },
      });
    }

    // ==================================================
    // FALLBACK TRACKING NUMBER
    // ==================================================

    if (!order && trackingNumber) {
      order = await Order.findOne({
        where: {
          tracking_number: trackingNumber,
        },
      });
    }

    // ==================================================
    // ORDER NOT FOUND
    // ==================================================

    if (!order) {
      console.log("⚠️ Order not found from webhook");

      return res.status(200).json({
        success: true,
      });
    }

    // ==================================================
    // UPDATE DATA
    // ==================================================

    const updateData = {};

    // ==================================================
    // TRACKING NUMBER
    // ==================================================

    if (trackingNumber) {
      updateData.tracking_number = trackingNumber;
    }

    // ==================================================
    // CARRIER
    // ==================================================

    if (resource.carrier_code || data.carrier_code) {
      updateData.carrier = resource.carrier_code || data.carrier_code;
    }

    // ==================================================
    // LABEL URL
    // ==================================================

    if (resource.label_download?.pdf) {
      updateData.label_url = resource.label_download.pdf;
    }

    // ==================================================
    // TRACKING URL
    // ==================================================

    if (resource.tracking_url) {
      updateData.tracking_url = resource.tracking_url;
    }

    // ==================================================
    // SHIPMENT / LABEL IDS
    // ==================================================

    if (resource.shipment_id) {
      updateData.shipment_id = resource.shipment_id;
    }

    if (resource.label_id) {
      updateData.label_id = resource.label_id;
    }

    // ==================================================
    // STATUS
    // ==================================================

    const webhookStatus = (
      resource.tracking_status ||
      resource.status ||
      data.status ||
      data.event ||
      ""
    ).toUpperCase();

    console.log("📦 WEBHOOK STATUS:", webhookStatus);

    // ==================================================
    // LABEL CREATED
    // ==================================================

    if (webhookStatus.includes("LABEL")) {
      updateData.shipment_status = "LABEL_CREATED";

      if (order.status === "PENDING_PAYMENT") {
        updateData.status = "CONFIRMED";
      }
    }

    // ==================================================
    // IN TRANSIT
    // ==================================================

    if (webhookStatus.includes("TRANSIT")) {
      updateData.shipment_status = "IN_TRANSIT";

      updateData.status = "SHIPPED";
    }

    // ==================================================
    // OUT FOR DELIVERY
    // ==================================================

    if (
      webhookStatus.includes("OUT_FOR_DELIVERY") ||
      webhookStatus.includes("OUT FOR DELIVERY")
    ) {
      updateData.shipment_status = "OUT_FOR_DELIVERY";

      updateData.status = "SHIPPED";
    }

    // ==================================================
    // DELIVERED
    // ==================================================

    if (webhookStatus.includes("DELIVERED")) {
      updateData.status = "DELIVERED";

      updateData.shipment_status = "DELIVERED";

      updateData.delivered_at = new Date();
    }

    // ==================================================
    // RETURNED
    // ==================================================

    if (webhookStatus.includes("RETURN")) {
      updateData.shipment_status = "RETURNED";

      updateData.status = "FAILED";
    }

    // ==================================================
    // EXCEPTION
    // ==================================================

    if (webhookStatus.includes("EXCEPTION")) {
      updateData.shipment_status = "EXCEPTION";
    }

    // ==================================================
    // FAILED
    // ==================================================

    if (webhookStatus.includes("FAILED")) {
      updateData.shipment_status = "FAILED";
    }

    // ==================================================
    // SUCCESS FALLBACK
    // ==================================================

    if (trackingNumber && !updateData.shipment_status) {
      updateData.shipment_status = "SUCCESS";

      if (order.status !== "DELIVERED") {
        updateData.status = "SHIPPED";
      }
    }

    // ==================================================
    // UPDATE ORDER
    // ==================================================

    await order.update(updateData);

    // ==================================================
    // UPDATE ORDER ITEMS
    // ==================================================

    await OrderItem.update(
      {
        shipment_status: updateData.shipment_status || "SUCCESS",
      },
      {
        where: {
          order_id: order.id,
        },
      },
    );

    console.log(`✅ Order Updated From Webhook: ${order.order_number}`);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("🚨 Webhook Processing Error:", error.message);

    return res.status(200).json({
      success: false,
    });
  }
};

const createShipmentLabel = catchAsync(async (req, res) => {
  // ==================================================
  // ORDER
  // ==================================================

  const order = await Order.findOne({
    where: {
      id: req.body.order_id,
      user_id: req.body.user.id,
    },
    include: [
      {
        model: OrderItem,
        as: "items",
      },
    ],
  });

  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, "Order not found");
  }

  const shipment = await purchaseLabelForOrder(order);

  const actualCost =
    Number(shipment.shipment_cost?.amount) ||
    Number(shipment.rate?.amount) ||
    Number(shipment.shipping_amount?.amount) ||
    0;

  const subtotal = Number(order.subtotal_amount || 0);

  const taxAmount = Number(order.tax_amount || 0);

  const finalTotal = subtotal + taxAmount + Number(actualCost);

  const shippingDifference =
    Number(actualCost || 0) - Number(order.quoted_shipping_amount || 0);

  await order.update({
    tracking_number: shipment.tracking_number || null,

    carrier: shipment.carrier_code || order.carrier_code,

    label_url: shipment.label_download?.pdf || shipment.label_url || null,

    tracking_url: shipment.tracking_url || null,

    shipment_id: shipment.shipment_id || null,

    label_id: shipment.label_id || null,

    shipped_at: shipment.ship_date || null,

    actual_shipping_cost: Number(actualCost.toFixed(2)),

    shipping_amount: Number(actualCost.toFixed(2)),

    total_amount: Number(finalTotal.toFixed(2)),

    shipping_profit: Number(
      (
        Number(order.quoted_shipping_amount || 0) - Number(actualCost || 0)
      ).toFixed(2),
    ),

    shipment_status: "LABEL_CREATED",
  });

  return responseWrapper(
    res,
    {
      order_id: order.id,

      order_number: order.order_number,

      payment_status: order.payment_status,

      shipment_status: "LABEL_CREATED",

      carrier: shipment.carrier_code || order.carrier_code,

      tracking_number: shipment.tracking_number,

      label_url: shipment.label_download?.pdf || shipment.label_url,

      tracking_url: shipment.tracking_url,

      pricing_breakdown: {
        subtotal: Number(subtotal.toFixed(2)),

        tax: Number(taxAmount.toFixed(2)),

        estimated_shipping: Number(
          Number(order.quoted_shipping_amount || 0).toFixed(2),
        ),

        actual_shipping: Number(actualCost.toFixed(2)),

        shipping_difference: Number(shippingDifference.toFixed(2)),

        final_total: Number(finalTotal.toFixed(2)),
      },

      explanation:
        shippingDifference > 0
          ? `Carrier final rate increased by $${shippingDifference.toFixed(2)}`
          : shippingDifference < 0
            ? `Carrier final rate decreased by $${Math.abs(shippingDifference).toFixed(2)}`
            : "Shipping matched estimated rate",
    },
    "Shipment Label Created",
    httpStatus.OK,
  );
});

const getAdminOrders = catchAsync(async (req, res) => {
  const data = await orderService.getAdminOrders(req.query);

  return responseWrapper(
    res,
    data,
    "Orders fetched successfully",
    httpStatus.OK,
  );
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  getShippingRatesController,
  createShipmentLabel,

  shipstationWebhook,

  getAdminOrders,
};

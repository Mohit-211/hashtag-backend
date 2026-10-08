/** @format */

const { shipstationClient } = require("../../config/shipstation");
const { Carrier, CarrierService } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");


const syncCarriers = async () => {
  try {
    const res = await shipstationClient.get("/v1/carriers");

    const carriers = res.data.carriers; // ✅ FIX

    if (!carriers || !Array.isArray(carriers)) {
      throw new Error("Invalid carriers response");
    }

    for (const c of carriers) {
      await Carrier.upsert({
        carrier_id: c.carrier_id,
        carrier_code: c.carrier_code,
        name: c.friendly_name,
        is_active: true,
      });
    }

    return carriers;

  } catch (error) {
    console.error("🚨 Carrier Sync Error:", error.response?.data || error.message);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.response?.data?.message || error.message
    );
  }
};

const syncServices = async () => {
  try {
    const carriers = await Carrier.findAll({ where: { is_active: true } });

    for (const carrier of carriers) {
      const res = await shipstationClient.get(
        `/v1/carriers/${carrier.carrier_id}/services`
      );

      const services = res.data.services; // ✅ FIX

      if (!services || !Array.isArray(services)) continue;

      for (const s of services) {
        await CarrierService.upsert({
          carrier_id: carrier.carrier_id,
          service_code: s.service_code,
          name: s.name,
          is_active: true,
        });
      }
    }

    return true;

  } catch (error) {
    console.error("🚨 Service Sync Error:", error.response?.data || error.message);

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.response?.data?.message || error.message
    );
  }
};


const getCarriers = async () => {
  try {
    const carriers = await Carrier.findAll({
      where: { is_active: true },
      order: [["name", "ASC"]],
    });

    return carriers;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};


const getServicesByCarrier = async (carrier_id) => {
  try {
    const services = await CarrierService.findAll({
      where: { carrier_id, is_active: true },
      order: [["name", "ASC"]],
    });

    if (!services.length) {
      throw new ApiError(httpStatus.NOT_FOUND, "No services found");
    }

    return services;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};


module.exports = {
  syncCarriers,
  syncServices,
  getCarriers,
  getServicesByCarrier,
};
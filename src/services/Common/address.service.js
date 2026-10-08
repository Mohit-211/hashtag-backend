/** @format */

const { getLatLng } = require("../../config/geo.helper");
const { validateAddress } = require("../../config/shipstation");
const { Address, Country, State, City } = require("../../models");
const ApiError = require("../../utils/ApiError");
const httpStatus = require("http-status");

const addAddress = async (body) => {
  try {
    const { user, country_id, state_id, city_id } = body;

    // ✅ 1. Fetch geo data
    const [country, state, city] = await Promise.all([
      Country.findByPk(country_id),
      State.findByPk(state_id),
      City.findByPk(city_id),
    ]);

    if (!country || !state || !city) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid location IDs");
    }

    // ✅ 2. Validate hierarchy
    if (city.state_id !== state.id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "City does not belong to selected state",
      );
    }

    if (state.country_id !== country.id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "State does not belong to selected country",
      );
    }

    // ✅ 3. Convert to ShipStation format
    const addressForValidation = {
      name: body.name,
      phone: body.phone,
      address_line1: body.address_line1,
      address_line2: body.address_line2,

      city: city.name,
      state: state.code || state.name, // use code like AK
      postal_code: body.postal_code,
      country_code: country.iso2 || "US",
    };
    console.log(addressForValidation, "addressForValidation");

    // ✅ 4. Validate address (ONLY ONCE)
    const cleaned = await validateAddress(addressForValidation);

    if (!cleaned) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Address validation failed");
    }

    // ✅ 5. Check duplicate
    const existing = await Address.findOne({
      attributes: ["id"],
      where: {
        user_id: user.id,
        address_line1: cleaned.address_line1,
        postal_code: cleaned.postal_code,
        city: cleaned.city_locality,
        state: cleaned.state_province,
        country: cleaned.country_code,
      },
    });

    if (existing) return existing;

    // ✅ 6. Get Lat/Lng (non-blocking safe)
    const coords = await getLatLng({
      address_line1: cleaned.address_line1,
      city: cleaned.city_locality,
      state: cleaned.state_province,
      postal_code: cleaned.postal_code,
      country: cleaned.country_code,
    });

    // ✅ check if user already has a default address
    const existingDefault = await Address.findOne({
      where: { user_id: user.id, is_default: true },
    });

    // ✅ determine default flag
    let isDefault = false;

    // if user explicitly sets default
    if (body.is_default) {
      // remove previous default
      await Address.update(
        { is_default: false },
        { where: { user_id: user.id } },
      );

      isDefault = true;
    }
    // if no default exists (first address)
    else if (!existingDefault) {
      isDefault = true;
    }

    // ✅ 7. Save
    const address = await Address.create({
      user_id: user.id,

      name: cleaned.name,
      phone: cleaned.phone,

      address_line1: cleaned.address_line1,
      address_line2: cleaned.address_line2,

      city: cleaned.city_locality,
      state: cleaned.state_province,
      country: cleaned.country_code,

      city_id,
      state_id,
      country_id,

      postal_code: cleaned.postal_code,

      latitude: coords?.latitude || null,
      longitude: coords?.longitude || null,

      is_default: isDefault,

      is_verified: true,
      raw_input: body,
    });

    return address;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAddresses = async (body) => {
  try {
    const { user } = body;

    return await Address.findAll({
      attributes: { exclude: [] },
      where: { user_id: user.id, is_active: true },
    });
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateAddress = async (body) => {
  try {
    const { id, user, country_id, state_id, city_id, ...data } = body;

    const address = await Address.findOne({
      where: { id, user_id: user.id },
    });

    if (!address) {
      throw new ApiError(httpStatus.NOT_FOUND, "Address not found");
    }

    let cleaned = null;
    let coords = null;

    // ✅ If location or address fields changed → revalidate
    if (
      data.address_line1 ||
      data.postal_code ||
      city_id ||
      state_id ||
      country_id
    ) {
      const [country, state, city] = await Promise.all([
        Country.findByPk(country_id || address.country_id),
        State.findByPk(state_id || address.state_id),
        City.findByPk(city_id || address.city_id),
      ]);

      if (!country || !state || !city) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid location IDs");
      }

      const addressForValidation = {
        name: data.name || address.name,
        phone: data.phone || address.phone,
        address_line1: data.address_line1 || address.address_line1,
        address_line2: data.address_line2 || address.address_line2,
        city: city.name,
        state: state.code || state.name,
        postal_code: data.postal_code || address.postal_code,
        country_code: country.iso2 || "US",
      };

      cleaned = await validateAddress(addressForValidation);

      coords = await getLatLng({
        address_line1: cleaned.address_line1,
        city: cleaned.city_locality,
        state: cleaned.state_province,
        postal_code: cleaned.postal_code,
        country: cleaned.country_code,
      });
    }

    // ✅ Handle default
    if (data.is_default) {
      await Address.update(
        { is_default: false },
        { where: { user_id: user.id } },
      );
    }

    // ✅ Update final payload
    await address.update({
      ...data,

      ...(cleaned && {
        address_line1: cleaned.address_line1,
        address_line2: cleaned.address_line2,
        city: cleaned.city_locality,
        state: cleaned.state_province,
        country: cleaned.country_code,
        postal_code: cleaned.postal_code,
        is_verified: true,
      }),

      ...(coords && {
        latitude: coords.latitude,
        longitude: coords.longitude,
      }),

      ...(city_id && { city_id }),
      ...(state_id && { state_id }),
      ...(country_id && { country_id }),
    });

    return address;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};


const deleteAddress = async (body,id) => {
  const {  user } = body;

  try {
    const address = await Address.findOne({
      where: { id, user_id: user.id },
    });

    if (!address) {
      throw new ApiError(httpStatus.NOT_FOUND, "Address not found");
    }

    const wasDefault = address.is_default;

    // ✅ soft delete (better for audit)
    await address.update({ is_active: false });

    // ✅ If deleted address was default → assign new default
    if (wasDefault) {
      const nextAddress = await Address.findOne({
        where: { user_id: user.id, is_active: true },
      });

      if (nextAddress) {
        await nextAddress.update({ is_default: true });
      }
    }

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};



module.exports = {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
};

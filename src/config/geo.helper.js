/** @format */

const axios = require("axios");
const settings = require("./settings");

// The map position of an address, or null. Without a Google Maps key (Settings page) addresses
// are saved without one.
const getLatLng = async (address) => {
	const key = settings.get("GOOGLE_MAPS_API_KEY");
	if (!key) return null;

	try {
		// ✅ remove ZIP+4 extension
		const postal = address.postal_code.split("-")[0];

		const query = `${address.address_line1}, ${address.city}, ${address.state}, ${postal}, ${address.country}`;

		const res = await axios.get(
			"https://maps.googleapis.com/maps/api/geocode/json",
			{
				params: {
					address: query,
					key,
				},
			}
		);

		const location = res.data.results?.[0]?.geometry?.location;

		if (!location) return null;

		return {
			latitude: location.lat,
			longitude: location.lng,
		};
	} catch (err) {
		console.error("🌍 GEO ERROR:", err.response?.data || err.message);
		return null;
	}
};

module.exports = { getLatLng };
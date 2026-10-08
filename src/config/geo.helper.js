/** @format */

const axios = require("axios");

const getLatLng = async (address) => {
	try {
		// ✅ remove ZIP+4 extension
		const postal = address.postal_code.split("-")[0];

		const query = `${address.address_line1}, ${address.city}, ${address.state}, ${postal}, ${address.country}`;

		const res = await axios.get(
			"https://maps.googleapis.com/maps/api/geocode/json",
			{
				params: {
					address: query,
					key: process.env.GOOGLE_MAPS_API_KEY,
				},
			}
		);

		console.log("🌍 GEO RESPONSE:", res.data.status);

		const location = res.data.results?.[0]?.geometry?.location;

		if (!location) return null;

        console.log(location,"location")

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
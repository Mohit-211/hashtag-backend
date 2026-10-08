const axios = require("axios");

const getOttoImage = async (req, res) => {
  try {
    const imageUrl = decodeURIComponent(req.query.url);

    const response = await axios.get(imageUrl, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      maxRedirects: 5,
    });

    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "image/jpeg"
    );

    response.data.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(404).end();
  }
};

module.exports = {
  getOttoImage,
};
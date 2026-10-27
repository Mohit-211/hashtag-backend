const httpStatus = require('http-status');

const { Country, State } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { SHIPPING_COUNTRY, isShippingState } = require('../../config/shippingRegions');


const getAllCountry = async (body, query, params) => {
    try {
        let result = [];
        result = await Country.findAll(
            {
                attributes: ['id', 'name'],
                where: { is_active: true },
                limit: parseInt(query['limit']),
                offset: parseInt(query['offset']),
                order: [
                    ['id', `${query.sortBy}`]
                ]
            });
        if (!result) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch all country.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const getCountryId = async (body, query, params) => {
    try {
        let result = {};
        result = await Country.findOne(
            {
                attributes: ['id', 'name', 'iso2'],
                include: [
                    {
                        model: State,
                        as: 'all_state',
                        attributes: ['id', 'name', 'country_id', 'iso2']
                    }
                ],
                where: { is_active: 1, id: params.id }
            }
        );
        if (!result) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Country not found.');
        };

        // Addresses are for shipping, so the shipping country lists only the states we ship to.
        const { iso2, ...country } = result.toJSON();
        const states = iso2 === SHIPPING_COUNTRY
            ? country.all_state.filter((state) => isShippingState(state.iso2) || isShippingState(state.name))
            : country.all_state;
        country.all_state = states.map(({ id, name, country_id }) => ({ id, name, country_id }));
        return country;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    getAllCountry,
    getCountryId
};
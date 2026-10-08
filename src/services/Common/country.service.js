const httpStatus = require('http-status');

const { Country, State } = require('../../models');
const ApiError = require('../../utils/ApiError');


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
                attributes: ['id', 'name'],
                include: [
                    {
                        model: State,
                        as: 'all_state',
                        attributes: ['id', 'name', 'country_id',]
                    }
                ],
                // where: { is_active: 1, id: params.id }
                where: { is_active: 1, id: 233 } 
            }
        );
        if (!result) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch country by ID.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    getAllCountry,
    getCountryId
};
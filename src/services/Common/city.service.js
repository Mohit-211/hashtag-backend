const httpStatus = require('http-status');

const { Country, State, City } = require('../../models');
const ApiError = require('../../utils/ApiError');

const getAllCity = async (body, query, params) => {
    try {
        let result = [];
        result = await City.findAll(
            {
                attributes: ['id', 'name'],
                where: { is_active: 1 },
                limit: parseInt(query['limit']),
                offset: parseInt(query['offset']),
                order: [
                    ['id', `${query.sortBy}`]
                ]
            });
        if (!result) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch all CITY.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const getCityById = async (body, query, params) => {
    try {
        let result = {};
        result = await City.findOne(
            {
                attributes: ['id', 'name', 'country_id', 'state_id'],
                include: [
                    {
                        model: Country,
                        as: 'country',
                        attributes: ['id', 'name',]
                    },
                    {
                        model: State,
                        as: 'state',
                        attributes: ['id', 'name',]
                    }
                ],
                where: { is_active: 1, id: params.id }
            }
        );
        if (!result) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch CITY by ID.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    getAllCity,
    getCityById
};
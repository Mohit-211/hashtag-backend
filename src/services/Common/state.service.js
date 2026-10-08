const httpStatus = require('http-status');

const { Country, State, City } = require('../../models');
const ApiError = require('../../utils/ApiError');

const getAllState = async (body, query, params) => {
    try {
        let result = [];
        result = await State.findAll(
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
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch all State.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const getStateById = async (body, query, params) => {
    try {
        let result = {};
        result = await State.findOne(
            {
                attributes: ['id', 'name'],
                include: [
                    {
                        model: Country,
                        as: 'country',
                        attributes: ['id', 'name']
                    },
                    {
                        model: City,
                        as: 'all_city',
                        attributes: ['id', 'name']
                    }
                ],
                where: { is_active: 1, id: params.id }
            }
        );
        if (!result) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to fetch State by ID.');
        };
        return result;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

module.exports = {
    getAllState,
    getStateById,
};
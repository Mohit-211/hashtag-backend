const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { cityService } = require('../../services');
const pick = require('../../utils/pick');
const config = require('../../config/config');
const responseWrapper = require('../../config/responseWrapper');


const getAllCity = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, []);

    if (!query['limit']) {
        query['limit'] = config.defaultLimit
    }
    if (!query['page']) {
        query['page'] = 1
    }
    if (!query['sortBy'] || query['sortBy'] === '') {
        query['sortBy'] = 'ASC'
    }
    let offset = (query['page'] - 1) * query['limit'];
    query['offset'] = offset;

    const response = await cityService.getAllCity(body, query, params);
    return responseWrapper(res, response, '');
});

const getCityById = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, ['id']);

    const response = await cityService.getCityById(body, query, params);
    return responseWrapper(res, response, '');
});

module.exports = {
    getAllCity,
    getCityById
};
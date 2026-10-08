const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { countryService } = require('../../services');
const pick = require('../../utils/pick');
const config = require('../../config/config');
const responseWrapper = require('../../config/responseWrapper');

const getAllCountry = catchAsync(async (req, res) => {

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

    const response = await countryService.getAllCountry(body, query, params);
    return responseWrapper(res, response, '');
});

const getCountryId = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, ['id']);

    const response = await countryService.getCountryId(body, query, params);
    return responseWrapper(res, response, '');
});

module.exports = {
    getAllCountry,
    getCountryId
};
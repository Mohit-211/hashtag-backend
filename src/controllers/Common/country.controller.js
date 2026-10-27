const catchAsync = require('../../utils/catchAsync');
const { countryService } = require('../../services');
const pick = require('../../utils/pick');
const settings = require('../../config/settings');
const responseWrapper = require('../../config/responseWrapper');

const getAllCountry = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, []);

    if (!query['limit']) {
        query['limit'] = settings.get('DEFAULT_API_DATA_LIMIT')
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
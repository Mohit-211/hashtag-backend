const httpStatus = require('http-status');

const catchAsync = require('../../utils/catchAsync');
const { stateService } = require('../../services');
const pick = require('../../utils/pick');
const config = require('../../config/config');
const responseWrapper = require('../../config/responseWrapper');


const getAllState = catchAsync(async (req, res) => {

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

    const response = await stateService.getAllState(body, query, params);
    return responseWrapper(res, response, '', httpStatus.OK);
});

const getStateById = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, ['id']);

    const response = await stateService.getStateById(body, query, params);
    return responseWrapper(res, response, '', httpStatus.OK);
});



module.exports = {
    getAllState,
    getStateById
};
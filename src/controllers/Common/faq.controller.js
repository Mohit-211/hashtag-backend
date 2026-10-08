const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const { faqService } = require('../../services/Common');
const responseWrapper = require('../../config/responseWrapper');

const createFaq = catchAsync(async (req, res) => {

    const faq = await faqService.createFaq(req.body);
    return responseWrapper(res, '', 'New FAQ Created Successfully.', httpStatus.CREATED);
});

const getAllFaq = catchAsync(async (req, res) => {

    const faqs = await faqService.getAllFaq();
    return responseWrapper(res, faqs, '', httpStatus.OK);
});

const updateFaq = catchAsync(async (req, res) => {

    const faq = await faqService.updateFaq(req.body, req.params.id);
    return responseWrapper(res, faq, 'Updated Successfully', httpStatus.OK);
});

const deleteFaq = catchAsync(async (req, res) => {

    await faqService.deleteFaq(req.params.id);
    return responseWrapper(res, '', 'Deleted Successfully', httpStatus.OK);
});

module.exports = {
    createFaq,
    getAllFaq,
    updateFaq,
    deleteFaq
};
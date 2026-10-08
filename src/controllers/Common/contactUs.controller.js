const httpStatus = require('http-status');

const catchAsync = require('../../utils/catchAsync');
const {contactUsService} = require('../../services');
const responseWrapper = require('../../config/responseWrapper');


const createContactUs = catchAsync(async (req, res) => {

    await contactUsService.createContactUs(req.body);
    return responseWrapper(res, '', 'New Contact Us Data Created Successfully.', httpStatus.CREATED);
});

const updateContactUs = catchAsync(async (req, res) => {

    const contactUsDoc = await contactUsService.updateContactUs(req.body, req.params.id);
    return responseWrapper(res, contactUsDoc, 'Update Successfully.');
});

const getAllContactUs = catchAsync(async (req, res) => {

    const contactUs = await contactUsService.getAllContactUs();
    return responseWrapper(res, contactUs, '');
});

const deleteContactUs = catchAsync(async (req, res) => {

    await contactUsService.deleteContactUs(req.params.id);
    return responseWrapper(res, '', 'Delete Successfull.');
});

module.exports = {
    createContactUs,
    getAllContactUs,
    updateContactUs,
    deleteContactUs
};
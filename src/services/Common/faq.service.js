const httpStatus = require('http-status');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Sequelize, QueryTypes, Op } = require('sequelize');
const moment = require('moment');
const randomize = require('randomatic');
const axios = require('axios');


const sequelize = require('../../config/central.db');
const { Admin, Role, Faq, Timezone } = require('../../models');
const validateEmail = require('../../helpers/validateEmail');
const validatePassword = require('../../helpers/validatePassword');
const ApiError = require('../../utils/ApiError');
const logger = require('../../config/logger');


const createFaq = async (reqBody) => {
    try {
        const faqObj = {
            question: reqBody.question,
            answer: reqBody.answer
        };
        const faqDoc = await Faq.create(faqObj);
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const getAllFaq = async () => {
    try {
        const faqDoc = await Faq.findAll(
            {
                attributes: ['id', 'question', 'answer'],
                where: { is_active: true },
                // order: [['created_at', 'DESC']]
            }
        );
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get all FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const updateFaq = async (reqBody, id) => {
    try {
        const { question, answer } = reqBody;
        const faqObj = {};

        if (question && typeof question === 'string' && question !== '') faqObj['question'] = question;
        if (answer && typeof answer === 'string' && answer !== '') faqObj['answer'] = answer;

        const faqDoc = await Faq.update(faqObj, { where: { id: id } });
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update new FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const deleteFaq = async (id) => {
    try {
        const faqDoc = await Faq.findOne({ where: { id: id, is_active: true } });
        if (!faqDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Invalid Id');
        await faqDoc.destroy();
        return '';

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const createTimezone = async () => {
    try {
        let timezonesArr = await axios.get('https://timeapi.io/api/TimeZone/AvailableTimeZones');
        timezonesArr = timezonesArr.data;
        for (let i = 0; i < timezonesArr.length; i++) {
            let currTimZone = timezonesArr[i];
            let timezoneRes = await axios.get(`https://timeapi.io/api/TimeZone/zone?timeZone=${currTimZone}`)
            timezoneRes = timezoneRes.data;
            let timezoneObj = {
                time_zone: timezoneRes.timeZone,
                current_local_time: timezoneRes.currentLocalTime,
                current_utc_offset: timezoneRes.currentUtcOffset,
                standard_utc_offset: timezoneRes.standardUtcOffset,
                has_day_light_saving: timezoneRes.hasDayLightSaving,
                is_day_light_saving_active: timezoneRes.isDayLightSavingActive,
            };
            const [timezone, created] = await Timezone.findOrCreate({
                where: { time_zone: timezoneRes.timeZone },
                defaults: timezoneObj,
            });
            logger.log("Timezone:", timezone.get());
            logger.log("Created:", created);
        }
    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const main = async () => {
    try {
        await createTimezone();
    } catch (error) {
        console.error(error);
    }
};

// main();

module.exports = {
    createFaq,
    getAllFaq,
    updateFaq,
    deleteFaq
};
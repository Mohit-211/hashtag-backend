const jwt = require('jsonwebtoken')
const moment = require('moment')
const config = require('../../config/config');

const { tokenTypes } = require('../../config/types');
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/central.db');
const ApiError = require('../../utils/ApiError');



const generateToken = (userId, expires, type, role_id, secret = config.jwt.secret) => {
    try {
        const payload = {
            sub: userId,
            iat: moment().unix(),
            exp: expires.unix(),
            type,
            role_id: role_id
        };
        return jwt.sign(payload, secret);

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const saveToken = async (token, userId, expires, type, role_id) => {
    try {
        let sql = `INSERT INTO user_tokens ( user_id, token_type, token, expired_at, created_at, updated_at, role_id) values (
            '${userId}', '${type}', '${token}', '${expires}' , now(), now(), ${role_id})`;

        let tokenDoc = await sequelize.query(
            sql, {
            type: QueryTypes.INSERT
        });
        return tokenDoc;

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};

const generateAuthTokens = async (user) => {
    try {
        if (!user) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error: Invalid User');
        };

        const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'days');
        const accessToken = generateToken(user.id, accessTokenExpires, tokenTypes.ACCESS, user.role_id);

        let tokenDoc = await saveToken(accessToken, user.id, moment.utc(accessTokenExpires).format('YYYY-MM-DD HH:mm:ss'), tokenTypes.ACCESS, user.role_id);

        return {
            access: {
                id : tokenDoc[0],
                token: accessToken,
                expires: accessTokenExpires.toDate(),
            },
            refresh: {
                id: '',
                token: '',
                expires: ''
            },
        };

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};


module.exports = {
    generateToken,
    saveToken,
    generateAuthTokens
};

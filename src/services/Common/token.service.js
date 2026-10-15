const crypto = require('crypto');
const httpStatus = require('http-status');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const config = require('../../config/config');

const { tokenTypes } = require('../../config/types');
const { UserToken } = require('../../models');
const ApiError = require('../../utils/ApiError');

// Customer access tokens are JWTs that are also stored in user_tokens; a token
// only works while its row is active (see userAuth.middleware).
const generateToken = (userId, expires, type, role_id, secret = config.jwt.secret) => {
    const payload = {
        sub: userId,
        iat: moment().unix(),
        exp: expires.unix(),
        type,
        role_id: role_id,
        // Unique per token: without it, two tokens issued in the same second were identical,
        // so revoking one session could leave an identical new one working.
        jti: crypto.randomBytes(16).toString('hex'),
    };
    return jwt.sign(payload, secret, { algorithm: 'HS256' });
};

const generateAuthTokens = async (user) => {
    if (!user) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error: Invalid User');
    };

    const accessTokenExpires = moment().add(config.jwt.accessExpirationDays, 'days');
    const accessToken = generateToken(user.id, accessTokenExpires, tokenTypes.ACCESS, user.role_id);

    const tokenDoc = await UserToken.create({
        user_id: user.id,
        role_id: user.role_id,
        token_type: tokenTypes.ACCESS,
        token: accessToken,
        expired_at: accessTokenExpires.toDate(),
    });

    return {
        access: {
            id: tokenDoc.id,
            token: accessToken,
            expires: accessTokenExpires.toDate(),
        },
        refresh: {
            id: '',
            token: '',
            expires: ''
        },
    };
};

// Signs the customer out everywhere (after a password change or reset).
const revokeUserTokens = (userId) =>
    UserToken.update(
        { is_active: false },
        { where: { user_id: userId, is_active: true } },
    );

module.exports = {
    generateAuthTokens,
    revokeUserTokens,
};

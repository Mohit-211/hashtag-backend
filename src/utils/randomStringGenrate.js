const crypto = require('crypto');

function generateRandomString(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < randomBytes.length; i++) {
        const randomIndex = randomBytes[i] % charset.length;
        randomString += charset.charAt(randomIndex);
    }

    return randomString;
};

module.exports = generateRandomString;

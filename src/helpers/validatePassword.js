// The one password rule, for every password a customer or an admin sets. It matches the
// shop's sign-up form (hashtag-next src/lib/validation.ts), as the client chose on 26 Oct 2026:
// 8 to 128 characters, with an uppercase letter, a number and a special character
// (anything that isn't a letter or a digit).
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const PASSWORD_RULES = `Password must be ${MIN_LENGTH} to ${MAX_LENGTH} characters long and include an uppercase letter, a number and a special character.`;

const validatePassword = (pass) =>
    typeof pass === 'string' &&
    pass.length >= MIN_LENGTH &&
    pass.length <= MAX_LENGTH &&
    /[A-Z]/.test(pass) &&
    /[0-9]/.test(pass) &&
    /[^A-Za-z0-9]/.test(pass);

module.exports = validatePassword;
module.exports.PASSWORD_RULES = PASSWORD_RULES;


const passwordValidator = require('password-validator');


// Create a schema
var schema = new passwordValidator();

// .has().uppercase()                              // Must have uppercase letters
// .has().lowercase()                              // Must have lowercase letters

// Add properties to it
schema
    .is().min(8)                                    // Minimum length 8
    .is().max(100)                                  // Maximum length 100
    .has().digits(2)                                // Must have at least 2 digits
    .has().not().spaces()                           // Should not have spaces
    .is().not().oneOf(['Passw0rd', 'Password123']); // Blacklist these values



const validatePassword = function (pass) {
    return schema.validate(pass)
};


module.exports = validatePassword;

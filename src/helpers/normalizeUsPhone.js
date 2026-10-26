// A US phone number as its 10 digits, or null when it isn't one. Accepts the usual
// formatting: "(832) 555-0123", "832.555.0123", "+1 832 555 0123". Area codes never start
// with 0 or 1.
const normalizeUsPhone = (value) => {
    const digits = String(value)
        .replace(/[\s().-]/g, '')
        .replace(/^\+?1(?=\d{10}$)/, '');
    return /^[2-9]\d{9}$/.test(digits) ? digits : null;
};

module.exports = normalizeUsPhone;

const httpStatus = require("http-status");

const ApiError = require("../utils/ApiError");

// Page size and search text on the lists anyone can call (audit point F18). A shopper's request
// gets at most 200 rows (the website asks for 16, its sitemap for 200) and searches the first 100
// characters of its search (the website's search box stops at 100). A request with a valid admin
// token keeps the admin panel's own sizes (it asks for up to 500) and its whole search: put
// identifyAdmin first. Plain whole numbers in range are unchanged; other spellings are read as
// whole numbers, so 1e3 counts as 1. Nothing out of range is refused, so old links keep working;
// only a search sent as several values is refused, on the lists that search.
const MAX_LIMIT = 200;
const ADMIN_MAX_LIMIT = 10000;
const MAX_PAGE = 1000000;
const MAX_SEARCH_LENGTH = 100;

// Brings query[key] into 1..max, read with parseInt as most lists read it: "16abc" is 16, "1e3" is
// 1, and a repeated parameter, "5,500", is 5. The lists that read it with Number get the same whole
// number. A value that isn't a number, or is 0, is removed, so the list's own default applies.
const clamp = (query, key, max) => {
  if (query[key] === undefined) return;
  const number = Number.parseInt(query[key], 10);
  if (Number.isNaN(number) || number === 0) {
    delete query[key];
    return;
  }
  query[key] = String(Math.min(Math.max(number, 1), max));
};

// The first `length` characters of a search, without cutting an emoji in half.
const cut = (text, length) => {
  const last = text.charCodeAt(length - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? length - 1 : length);
};

// Use as listLimits() after identifyAdmin. `max` is a shopper's largest page: 200, unless the
// website itself asks one list for more. `search: false` is for a list that has no search: its
// search parameter is left alone, as before.
const listLimits = ({ max = MAX_LIMIT, search = true } = {}) => (req, res, next) => {
  const { query } = req;
  const admin = Boolean(req.admin);

  clamp(query, "limit", admin ? Math.max(max, ADMIN_MAX_LIMIT) : max);
  clamp(query, "page", MAX_PAGE);

  if (search && query.search !== undefined) {
    // ?search=a&search=b or ?search[x]=a: a list or object, which some lists can't handle.
    if (typeof query.search !== "string") {
      return next(new ApiError(httpStatus.BAD_REQUEST, "Enter a single search."));
    }
    // Spaces around a search don't count towards its 100 characters. A search still longer than
    // that is trimmed and cut; any other search reaches the list exactly as sent.
    const text = query.search.trim();
    if (!admin && text.length > MAX_SEARCH_LENGTH) {
      query.search = cut(text, MAX_SEARCH_LENGTH);
    }
  }
  return next();
};

module.exports = {
  listLimits,
  MAX_LIMIT,
  ADMIN_MAX_LIMIT,
  MAX_PAGE,
  MAX_SEARCH_LENGTH,
};

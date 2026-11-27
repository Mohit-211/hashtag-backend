// Clients the team adds from the admin panel: Users › Add User, one at a time, and Users › Import
// clients from CSV. Each gets a generated password, returned once so the admin can copy it or
// email it (sendLoginDetails in user.service.js). It's stored one-way and can't be shown again.
// Accounts made this way count as verified, as before.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const config = require("../../config/config");
const { User, Profile } = require("../../models");
const { userStatusTypes } = require("../../config/types");
const { links } = require("../../config/accountPolicy");
const validateEmail = require("../../helpers/validateEmail");
const normalizeUsPhone = require("../../helpers/normalizeUsPhone");

const NAME_MAX = 150; // profiles.name
const EMAIL_MAX = 200; // users.email

// The panel's Generate button uses the same sets (lib/session.ts generatePassword): no look-alike
// characters, and at least one of each kind the password rule asks for.
const PASSWORD_SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!#$%&*?@"];
const PASSWORD_LENGTH = 14;

const generatePassword = () => {
  const all = PASSWORD_SETS.join("");
  const chars = [
    ...PASSWORD_SETS.map((set) => set[crypto.randomInt(set.length)]),
    ...Array.from({ length: PASSWORD_LENGTH - PASSWORD_SETS.length }, () => all[crypto.randomInt(all.length)]),
  ];
  // Shuffled, so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

// A new password and its hash. Hashing takes about 50 ms, so an import does it before its
// transaction starts.
const newCredentials = async () => {
  const password = generatePassword();
  return { password, hash: await bcrypt.hash(password, 10) };
};

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const lengthOf = (value) => Array.from(value).length;

const MOBILE_RULE = "Use a 10-digit US number, like (832) 555-0123, or leave it empty.";

// Checks one client's details, as typed on Add User or read from a CSV row. Returns the values to
// save (the mobile as its 10 digits, as sign-up saves it) and a problem per field, if any.
const checkClientDetails = ({ name, email, mobile }) => {
  const values = { name: clean(name), email: clean(email), mobile: null };
  const problems = {};

  if (!values.name) problems.name = "Add the client's name.";
  else if (lengthOf(values.name) > NAME_MAX) problems.name = `A name can be at most ${NAME_MAX} characters.`;

  if (!values.email) problems.email = "Add the client's email address.";
  else if (values.email.length > EMAIL_MAX) problems.email = `An email address can be at most ${EMAIL_MAX} characters.`;
  else if (!validateEmail(values.email)) problems.email = `"${values.email}" isn't an email address.`;

  const mobileText = clean(mobile);
  if (mobileText) {
    values.mobile = normalizeUsPhone(mobileText);
    if (!values.mobile) problems.mobile = `"${mobileText}" isn't a US phone number. ${MOBILE_RULE}`;
  }

  return { values, problems };
};

// The live customer account with this email, if any: sign-up's rule (User.isEmailTaken). Emails
// compare without case (the column's collation). A deleted account doesn't count, so its email
// can be added again.
const findClientByEmail = (email, options = {}) =>
  User.findOne({
    where: { email, role_id: config.USR_ROLE_ID, is_active: true },
    include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
    ...options,
  });

// Creates the account and its profile. `hash` comes from newCredentials().
const createClientAccount = async ({ name, email, mobile }, { hash, adminId = null, transaction } = {}) => {
  const user = await User.create(
    {
      email,
      password: hash,
      role_id: config.USR_ROLE_ID,
      status: userStatusTypes.ACCEPTED,
      created_by: adminId,
    },
    { transaction },
  );

  await Profile.create({ email, name, mobile, user_id: user.id, created_by: adminId }, { transaction });

  return { id: Number(user.id), name, email, mobile };
};

// The website's sign-in page, for the panel's "Copy for a message" text; null while the website
// address isn't set (Settings).
const signInUrl = () => {
  try {
    return links.signIn();
  } catch {
    return null;
  }
};

module.exports = {
  NAME_MAX,
  EMAIL_MAX,
  MOBILE_RULE,
  clean,
  generatePassword,
  newCredentials,
  checkClientDetails,
  findClientByEmail,
  createClientAccount,
  signInUrl,
};

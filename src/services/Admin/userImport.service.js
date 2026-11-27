// Clients from a CSV file (admin panel: Users › Import clients from CSV), for the team's existing
// clients: one row per client, with a name, an email and, if known, a mobile number. Built like the
// pricing template import: the preview lists every problem by spreadsheet row and saves nothing;
// the import creates every new client in one transaction, or none.
//
// An email that already has an account is left as it is and listed, not counted as a problem, so a
// list can be imported again after adding to it. Each new client gets a generated password, which
// the import answers once; the panel shows it and emails it on request (sendLoginDetails).

const httpStatus = require("http-status");
const { Op } = require("sequelize");

const sequelize = require("../../config/central.db");
const config = require("../../config/config");
const ApiError = require("../../utils/ApiError");
const { decode, parseCsv, toCsv } = require("../../utils/csv");
const { User, Profile } = require("../../models");
const { userStatusTypes } = require("../../config/types");
const {
  NAME_MAX,
  MOBILE_RULE,
  clean,
  checkClientDetails,
  newCredentials,
  createClientAccount,
  signInUrl,
} = require("./clientAccounts");

// Each new client's password is hashed during the import (about 50 ms each), so a file is kept
// well inside the 100 seconds Cloudflare waits for an answer.
const MAX_FILE_ROWS = 500;
const MAX_FILE_MB = 2; // csvLimits in config/multer.js

// The columns, in the example's order. `aliases` are other headers read as the same column;
// headers compare without case, spaces or punctuation.
const COLUMNS = [
  {
    key: "name",
    header: "Name",
    aliases: ["Full name", "Client name", "Customer name", "Contact name", "Client", "Customer", "Contact"],
    required: true,
    help: `The client's full name, as their account and orders will show it. Up to ${NAME_MAX} characters. A sheet with First name and Last name columns instead works too.`,
  },
  {
    key: "email",
    header: "Email",
    aliases: ["Email address", "E-mail", "E-mail address", "Mail", "Email ID"],
    required: true,
    help: "The address they'll sign in with and get their login details at. Each client once.",
  },
  {
    key: "mobile",
    header: "Mobile",
    aliases: ["Mobile number", "Mobile no", "Phone", "Phone number", "Cell", "Cell phone", "Cell number", "Telephone", "Tel", "Contact number"],
    required: false,
    help: `Optional. ${MOBILE_RULE}`,
  },
];

// Read when a sheet splits the name; not listed on the upload page.
const NAME_PARTS = [
  { key: "first_name", aliases: ["First name", "First", "Given name", "Firstname"] },
  { key: "last_name", aliases: ["Last name", "Last", "Surname", "Family name", "Lastname"] },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));
const headerKey = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = new Map(
  [
    ...COLUMNS.map((column) => [column.key, [column.header, ...column.aliases]]),
    ...NAME_PARTS.map((part) => [part.key, part.aliases]),
  ].flatMap(([key, headers]) => headers.map((h) => [headerKey(h), key])),
);
const HEADER_NAMES = {
  ...Object.fromEntries(COLUMNS.map((column) => [column.key, column.header])),
  first_name: "First name",
  last_name: "Last name",
};

// Emails compare as the database compares them (utf8mb4_general_ci): without case or accents.
const emailKey = (value) =>
  clean(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// The example file's addresses. Nobody has mail at these (RFC 2606), so a row with one is the
// example uploaded by mistake.
const EXAMPLE_DOMAIN = /@(.+\.)?example\.(com|org|net)$/i;

// Live customer accounts with these emails, by emailKey.
const existingAccounts = async (emails, transaction) => {
  if (!emails.length) return new Map();
  const users = await User.findAll({
    where: { email: { [Op.in]: emails }, role_id: config.USR_ROLE_ID, is_active: true },
    include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
    attributes: ["id", "email", "status"],
    transaction,
  });
  return new Map(users.map((user) => [emailKey(user.email), user]));
};

// ------------------------------------------------------------------------------------------
// Checking a file
// ------------------------------------------------------------------------------------------

// Reads and checks the file. Returns { report, plan }: the report is what the admin sees, the
// plan the clients an import would create (only used when the report has no errors).
const checkFile = async (file) => {
  if (!file?.buffer?.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Choose a CSV file to upload.");
  }

  const errors = [];
  const warnings = [];
  const fail = (row, column, message) => errors.push({ row, column, message });
  const warn = (row, column, message) => warnings.push({ row, column, message });
  const byRow = (a, b) => (a.row ?? 0) - (b.row ?? 0);

  const report = ({ rows = 0, clients = [], already = [], ignored = [] } = {}) => ({
    file_name: file.originalname || null,
    summary: {
      rows,
      new_clients: clients.length,
      already_clients: already.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    clients,
    // Rows whose email already has an account: left as they are.
    already_clients: already,
    ignored_columns: ignored,
    errors: [...errors].sort(byRow),
    warnings: [...warnings].sort(byRow),
    can_import: errors.length === 0 && clients.length > 0,
  });

  const decoded = decode(file.buffer);
  let rows;
  try {
    rows = parseCsv(decoded);
  } catch (error) {
    fail(null, null, error.message);
    return { report: report(), plan: null };
  }

  // Header row
  const [header = [], ...body] = rows;
  const columnIndex = {};
  const ignored = [];

  header.forEach((raw, index) => {
    const text = clean(raw);
    if (!text) return;

    const key = HEADER_LOOKUP.get(headerKey(text));
    if (!key) {
      ignored.push(text);
    } else if (key in columnIndex) {
      fail(1, text, `Two columns mean "${HEADER_NAMES[key]}": "${clean(header[columnIndex[key]])}" and "${text}". Keep one of them.`);
    } else {
      columnIndex[key] = index;
    }
  });

  const hasName = "name" in columnIndex || "first_name" in columnIndex || "last_name" in columnIndex;
  if (!("email" in columnIndex) || !hasName) {
    const missing = [!hasName && '"Name"', !("email" in columnIndex) && '"Email"'].filter(Boolean).join(" and ");
    fail(1, null, `The first row must name the columns, with one called ${missing}. Download the example CSV to see the layout.`);
    return { report: report({ ignored }), plan: null };
  }

  if (ignored.length) {
    warn(1, null, `These columns aren't used and are skipped: ${ignored.join(", ")}.`);
  }
  if (decoded.includes("�")) {
    warn(null, null, 'Some characters couldn\'t be read. In Excel, save the file as "CSV UTF-8" and upload it again.');
  }

  const cell = (row, key) => (key in columnIndex ? clean(row.cells[columnIndex[key]]) : "");
  const nameOf = (row) =>
    "name" in columnIndex ? cell(row, "name") : clean(`${cell(row, "first_name")} ${cell(row, "last_name")}`);
  const nameColumn = "name" in columnIndex ? "Name" : "First name";

  // Spreadsheet row numbers: the header is row 1. Blank rows are skipped.
  const dataRows = body
    .map((cells, index) => ({ number: index + 2, cells }))
    .filter((row) => row.cells.some((value) => clean(value) !== ""));

  if (!dataRows.length) {
    fail(null, null, "The file has no rows under the header.");
    return { report: report({ ignored }), plan: null };
  }
  if (dataRows.length > MAX_FILE_ROWS) {
    fail(null, null, `The file has ${dataRows.length} rows. Import at most ${MAX_FILE_ROWS} clients at a time: split it into smaller files.`);
    return { report: report({ rows: dataRows.length, ignored }), plan: null };
  }

  // Each row on its own, then the emails against each other and the database.
  const checked = [];
  const seen = new Map();

  for (const row of dataRows) {
    const { values, problems } = checkClientDetails({
      name: nameOf(row),
      email: cell(row, "email"),
      mobile: cell(row, "mobile"),
    });

    if (problems.name) fail(row.number, nameColumn, problems.name);
    if (problems.email) fail(row.number, "Email", problems.email);
    if (problems.mobile) fail(row.number, "Mobile", problems.mobile);
    if (problems.email) continue;

    if (EXAMPLE_DOMAIN.test(values.email)) {
      fail(row.number, "Email", `"${values.email}" is an example address. Put the client's real email address.`);
      continue;
    }

    const key = emailKey(values.email);
    if (seen.has(key)) {
      fail(row.number, "Email", `${values.email} is already on row ${seen.get(key)}. List each client once.`);
      continue;
    }
    seen.set(key, row.number);

    if (!problems.name && !problems.mobile) checked.push({ row: row.number, ...values });
  }

  const accounts = await existingAccounts(checked.map((c) => c.email));
  const clients = [];
  const already = [];

  for (const client of checked) {
    const account = accounts.get(emailKey(client.email));
    if (!account) {
      clients.push(client);
      continue;
    }
    already.push({
      row: client.row,
      name: client.name,
      email: account.email,
      user_id: Number(account.id),
      account_name: account.user_profile?.name ?? null,
      // Signed up on the website but hasn't verified the email yet.
      verified: account.status === userStatusTypes.ACCEPTED,
    });
  }

  return {
    report: report({ rows: dataRows.length, clients, already, ignored }),
    plan: clients,
  };
};

// ------------------------------------------------------------------------------------------
// Importing
// ------------------------------------------------------------------------------------------

const previewImport = async (file) => (await checkFile(file)).report;

// Creates every new client in the file, or none. A file with problems returns { imported: false,
// report } and changes nothing. Answers each new client with its password, once.
const importClients = async (file, { adminId = null } = {}) => {
  const { report, plan } = await checkFile(file);
  if (!report.can_import) {
    return { imported: false, report };
  }

  // Passwords first: hashing is the slow part, and the transaction stays short.
  const credentials = [];
  for (let i = 0; i < plan.length; i += 1) {
    credentials.push(await newCredentials());
  }

  const created = await sequelize.transaction(async (transaction) => {
    // Someone may have signed up, or been added, since the check.
    const taken = await existingAccounts(plan.map((c) => c.email), transaction);
    if (taken.size) {
      const emails = [...taken.values()].map((user) => user.email);
      throw new ApiError(
        httpStatus.CONFLICT,
        `${emails.join(", ")} ${emails.length === 1 ? "got an account" : "got accounts"} while importing. Nothing was imported: check the file again, then import.`,
      );
    }

    const out = [];
    for (const [index, client] of plan.entries()) {
      const { password, hash } = credentials[index];
      const saved = await createClientAccount(client, { hash, adminId, transaction });
      out.push({ ...saved, row: client.row, password });
    }
    return out;
  });

  return {
    imported: true,
    clients: created,
    already_clients: report.already_clients,
    summary: { created: created.length, already_clients: report.already_clients.length },
    warnings: report.warnings,
    sign_in_url: signInUrl(),
  };
};

// ------------------------------------------------------------------------------------------
// The layout, for the upload page
// ------------------------------------------------------------------------------------------

const exampleRows = () => [
  COLUMNS.map((c) => c.header),
  ["Jordan Smith", "jordan.smith@example.com", "(832) 555-0142"],
  ["Maria Lopez", "maria.lopez@example.com", ""],
  ["Sam Patel", "sam@patel-builders.example.com", "713-555-0199"],
];

const getImportFormat = async () => {
  const example = exampleRows();
  return {
    columns: COLUMNS.map(({ key, header, required, help }) => ({ key, header, required, help })),
    limits: { max_rows: MAX_FILE_ROWS, max_file_mb: MAX_FILE_MB, name_max: NAME_MAX },
    example_file_name: "clients-example.csv",
    example_csv: toCsv(example),
    example_rows: example,
    template_csv: toCsv([COLUMNS.map((c) => c.header)]),
  };
};

module.exports = { getImportFormat, previewImport, importClients, MAX_FILE_ROWS };

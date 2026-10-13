// Audit hooks shared by the models. Timestamps are written as UTC "YYYY-MM-DD HH:MM:SS" strings.

const utcNow = () => new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");

const touchUpdatedAt = (instance) => {
  instance.updated_at = utcNow();
};

const markDeleted = (instance) => {
  instance.deleted_at = utcNow();
  instance.is_active = false;
};

module.exports = { utcNow, touchUpdatedAt, markDeleted };

// Uploads a route keeps. On the routes that take only their form's fields (config/multer.js
// UPLOADS), every file of the request that isn't marked here is deleted once the route has
// answered, whether it succeeded or not (upload.middleware.js). A service on those routes marks
// each file right after saving the record that points to it: a later refusal mustn't delete it.

const KEPT = Symbol("kept upload");

// Marks an uploaded file (multer's file object) as kept. Safe with no file, and twice.
const keepUpload = (file) => {
  if (file) file[KEPT] = true;
};

const isKept = (file) => Boolean(file?.[KEPT]);

module.exports = {
  keepUpload,
  isKept,
};

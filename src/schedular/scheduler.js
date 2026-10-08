const cron = require("node-cron");
const { syncImportedSSProducts } = require("../services/Common/ssSync.service");
// cron.schedule(
//   "0 2 15 * *",
//   async () => {
//     console.log("🚀 Running Monthly SS Sync");

//     try {
//       await syncImportedSSProducts();

//       console.log("✅ Monthly SS Sync Completed");
//     } catch (err) {
//       console.error("❌ Monthly SS Sync Failed", err);
//     }
//   },
//   {
//     timezone: "America/New_York",
//   }
// );